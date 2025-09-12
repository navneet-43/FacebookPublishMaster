import fetch from 'node-fetch';
import { storage } from '../storage';
import { progressTracker } from './progressTrackingService';
import { CustomLabelValidator } from './customLabelValidator';
import { getPageAccessToken } from './facebookTokenService';
import os from 'os';
import { statSync, createWriteStream, unlinkSync } from 'fs';
import { pipeline } from 'stream/promises';

export interface StreamingUploadOptions {
  googleDriveUrl: string;
  accountId: number;
  userId: number;
  content?: string;
  customLabels?: string[];
  language?: string;
  uploadId?: string;
  isReel?: boolean;
}

export interface StreamingUploadResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  facebookUrl?: string;
  error?: string;
  method: 'streaming_upload' | 'temp_upload_with_cleanup';
  sizeMB?: number;
}

export class StreamingVideoUploadService {
  private static readonly MAX_STREAMING_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly MIN_FREE_MB = 500; // 500MB minimum free space
  
  /**
   * Check available disk space using proper disk space monitor
   */
  private static async checkDiskSpace(): Promise<{ hasSpace: boolean; freeMB: number }> {
    try {
      const { DiskSpaceMonitor } = await import('./diskSpaceMonitor');
      const spaceInfo = await DiskSpaceMonitor.getDiskSpaceInfo();
      
      if (!spaceInfo) {
        return { hasSpace: false, freeMB: 0 };
      }
      
      return { 
        hasSpace: spaceInfo.freeMB > this.MIN_FREE_MB && spaceInfo.usagePercent < 90,
        freeMB: spaceInfo.freeMB 
      };
    } catch (error) {
      console.error('Could not check disk space:', error);
      return { hasSpace: false, freeMB: 0 };
    }
  }

  /**
   * Extract Google Drive file ID from URL
   */
  private static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Get direct download URL for Google Drive file
   */
  private static getDirectDownloadUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  }

  /**
   * Stream video directly to Facebook (experimental - for smaller files)
   */
  private static async streamDirectlyToFacebook(
    sourceUrl: string,
    account: any,
    options: StreamingUploadOptions
  ): Promise<StreamingUploadResult> {
    console.log('🌊 ATTEMPTING DIRECT STREAMING TO FACEBOOK');
    
    try {
      // Get file metadata first
      const response = await fetch(sourceUrl, { method: 'HEAD' });
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      
      if (contentLength > this.MAX_STREAMING_SIZE) {
        console.log(`⚠️  File too large for streaming: ${(contentLength / 1024 / 1024).toFixed(1)}MB > ${this.MAX_STREAMING_SIZE / 1024 / 1024}MB`);
        return { success: false, error: 'File too large for direct streaming', method: 'streaming_upload' };
      }

      console.log(`📊 File size: ${(contentLength / 1024 / 1024).toFixed(1)}MB - suitable for streaming`);

      // Use existing page token (it should be fresh from token refresh system)
      const pageToken = account.pageToken;
      const initUrl = `https://graph.facebook.com/v23.0/${account.pageId}/${options.isReel ? 'video_reels' : 'videos'}`;
      
      const initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pageToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload_phase: 'start',
          file_size: contentLength,
        }),
      });

      const initData = await initResponse.json() as { video_id?: string; upload_url?: string; error?: any };
      if (!initData.video_id || !initData.upload_url) {
        throw new Error(`Failed to initialize Facebook upload session: ${JSON.stringify(initData)}`);
      }

      console.log(`📤 Streaming to Facebook upload URL: ${initData.upload_url}`);

      // Stream file directly to Facebook
      const fileStream = await fetch(sourceUrl);
      if (!fileStream.ok || !fileStream.body) {
        throw new Error('Failed to get file stream from Google Drive');
      }

      const uploadResponse = await fetch(initData.upload_url, {
        method: 'POST',
        body: fileStream.body,
        headers: {
          'Authorization': `Bearer ${pageToken}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': contentLength.toString(),
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Facebook upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      // Finalize upload
      const finalizeResponse = await fetch(initUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pageToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload_phase: 'finish',
          video_id: initData.video_id,
          description: options.content || '',
        }),
      });

      const finalData = await finalizeResponse.json() as { id?: string; error?: any };
      
      console.log('✅ DIRECT STREAMING SUCCESSFUL');
      return {
        success: true,
        facebookVideoId: initData.video_id,
        facebookPostId: finalData.id || initData.video_id,
        method: 'streaming_upload',
        sizeMB: contentLength / (1024 * 1024)
      };

    } catch (error) {
      console.error('❌ Direct streaming failed:', error);
      return { success: false, error: `Streaming failed: ${error}`, method: 'streaming_upload' };
    }
  }

  /**
   * Fallback: Use temporary file with aggressive cleanup
   */
  private static async uploadWithTempFile(
    sourceUrl: string,
    account: any,
    options: StreamingUploadOptions
  ): Promise<StreamingUploadResult> {
    console.log('📁 USING TEMPORARY FILE WITH AGGRESSIVE CLEANUP');
    
    const fileId = this.extractFileId(options.googleDriveUrl);
    const tempFile = `/tmp/streaming_${fileId}_${Date.now()}.mp4`;
    
    try {
      // Check disk space first
      const spaceCheck = await this.checkDiskSpace();
      if (!spaceCheck.hasSpace) {
        throw new Error(`Insufficient disk space. Free space: ${spaceCheck.freeMB.toFixed(1)}MB`);
      }

      console.log(`💾 Downloading to temp file: ${tempFile}`);
      console.log(`💿 Available space: ${spaceCheck.freeMB.toFixed(1)}MB`);

      // Download with streaming to minimize memory usage
      const response = await fetch(sourceUrl);
      if (!response.ok || !response.body) {
        throw new Error('Failed to get file from Google Drive');
      }

      const fileStream = createWriteStream(tempFile);
      await pipeline(response.body, fileStream);

      // Check file size
      const stats = statSync(tempFile);
      const sizeMB = stats.size / (1024 * 1024);
      console.log(`📊 Downloaded file size: ${sizeMB.toFixed(1)}MB`);

      // Upload to Facebook using existing chunked service
      const { ChunkedVideoUploadService } = await import('./chunkedVideoUploadService');
      const uploader = new ChunkedVideoUploadService();
      
      console.log('📤 Uploading to Facebook via chunked upload...');
      const uploadResult = await uploader.uploadVideoInChunks({
        accessToken: account.pageToken,
        pageId: account.pageId,
        filePath: tempFile,
        description: options.content,
        customLabels: options.customLabels,
        language: options.language,
        isReel: options.isReel
      });

      // CRITICAL: Always clean up temp file
      try {
        unlinkSync(tempFile);
        console.log(`🗑️  Cleaned up temp file: ${tempFile}`);
      } catch (cleanupError) {
        console.error('⚠️  Failed to clean up temp file:', cleanupError);
      }

      if (uploadResult.success) {
        return {
          success: true,
          facebookVideoId: uploadResult.videoId,
          facebookPostId: uploadResult.videoId, // Use videoId as postId for consistency
          facebookUrl: uploadResult.facebookUrl,
          method: 'temp_upload_with_cleanup',
          sizeMB
        };
      } else {
        throw new Error(uploadResult.error || 'Facebook upload failed');
      }

    } catch (error) {
      // CRITICAL: Always clean up temp file on error
      try {
        unlinkSync(tempFile);
        console.log(`🗑️  Cleaned up temp file after error: ${tempFile}`);
      } catch (cleanupError) {
        console.error('⚠️  Failed to clean up temp file after error:', cleanupError);
      }

      console.error('❌ Temp file upload failed:', error);
      return { 
        success: false, 
        error: `Upload failed: ${error}`, 
        method: 'temp_upload_with_cleanup' 
      };
    }
  }

  /**
   * Main upload method - tries streaming first, falls back to temp file
   */
  static async uploadGoogleDriveVideo(options: StreamingUploadOptions): Promise<StreamingUploadResult> {
    const uploadId = options.uploadId || `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🌊 STARTING STREAMING UPLOAD - ID: ${uploadId}`);
    
    try {
      // Get account details
      const account = await storage.getFacebookAccount(options.accountId);
      if (!account) {
        throw new Error('Facebook account not found');
      }

      // Extract file ID
      const fileId = this.extractFileId(options.googleDriveUrl);
      if (!fileId) {
        throw new Error('Invalid Google Drive URL');
      }

      const directUrl = this.getDirectDownloadUrl(fileId);
      console.log(`📥 Direct download URL: ${directUrl}`);

      // Update progress
      progressTracker.updateProgress(uploadId, 'Attempting direct streaming...', 20, 'Trying to stream directly to Facebook');

      // Try direct streaming first (for smaller files)
      const streamingResult = await this.streamDirectlyToFacebook(directUrl, account, options);
      if (streamingResult.success) {
        progressTracker.updateProgress(uploadId, 'Upload complete via streaming!', 100, 'Direct streaming successful');
        return streamingResult;
      }

      console.log('🔄 Direct streaming failed, falling back to temp file approach');
      progressTracker.updateProgress(uploadId, 'Using temp file with cleanup...', 40, 'Fallback to temporary file approach');

      // Fallback to temp file approach
      const tempResult = await this.uploadWithTempFile(directUrl, account, options);
      if (tempResult.success) {
        progressTracker.updateProgress(uploadId, 'Upload complete via temp file!', 100, 'Temporary file upload successful with cleanup');
      }

      return tempResult;

    } catch (error) {
      console.error('❌ STREAMING UPLOAD FAILED:', error);
      progressTracker.updateProgress(uploadId, `Upload failed: ${error}`, 0, 'Upload process failed');
      
      return {
        success: false,
        error: `Streaming upload failed: ${error}`,
        method: 'streaming_upload'
      };
    }
  }

  /**
   * Global cleanup function for orphaned temp files
   */
  static async cleanupOrphanedTempFiles(): Promise<void> {
    try {
      console.log('🧹 Starting cleanup of orphaned temp files...');
      
      const { spawn } = await import('child_process');
      const cleanup = spawn('find', ['/tmp', '-name', 'streaming_*.mp4', '-mtime', '+1', '-delete'], {
        stdio: 'pipe'
      });
      
      cleanup.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Orphaned temp file cleanup completed');
        } else {
          console.warn('⚠️  Temp file cleanup completed with warnings');
        }
      });

    } catch (error) {
      console.error('❌ Failed to cleanup orphaned temp files:', error);
    }
  }
}