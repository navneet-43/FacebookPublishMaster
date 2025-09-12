import { CorrectGoogleDriveDownloader } from './correctGoogleDriveDownloader';
import { progressTracker } from './progressTrackingService';
import { ChunkedVideoUploadService } from './chunkedVideoUploadService';
import { storage } from '../storage';
import { statSync, unlinkSync } from 'fs';
import { deploymentConfig } from '../config/deploymentConfig';

export interface CompleteVideoUploadOptions {
  googleDriveUrl: string;
  accountId: number;
  userId: number;
  content?: string;
  customLabels?: string[];
  language?: string;
  uploadId?: string;
}

export interface CompleteVideoUploadResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  facebookUrl?: string;
  downloadedSize?: number;
  uploadedSize?: number;
  uploadedSizeMB?: number;
  postId?: string;
  videoId?: string;
  error?: string;
  method: 'google_drive_chunked_upload' | 'processed_video_file_upload' | 'true_streaming_upload';
  steps?: string[];
}

export class CompleteVideoUploadService {
  private downloader = new CorrectGoogleDriveDownloader();
  private uploader = new ChunkedVideoUploadService();
  
  async uploadGoogleDriveVideoInChunks(options: CompleteVideoUploadOptions): Promise<CompleteVideoUploadResult> {
    const steps: string[] = [];
    const uploadId = options.uploadId || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`🌊 USING TRUE STREAMING SERVICE - Upload ID: ${uploadId}`);
      steps.push('True streaming process initiated');
      
      // CRITICAL: Check disk space before any operation
      const { DiskSpaceMonitor } = await import('./diskSpaceMonitor');
      const spaceAlert = await DiskSpaceMonitor.checkDiskSpace();
      
      if (spaceAlert && (spaceAlert.level === 'critical' || spaceAlert.level === 'emergency')) {
        throw new Error(`Upload blocked - ${spaceAlert.message}`);
      }
      
      console.log('🛡️ Disk space check passed, proceeding with true streaming...');
      
      // Use TRUE STREAMING SERVICE instead of downloading + uploading
      const { TrueStreamingVideoUploadService } = await import('./trueStreamingVideoUploadService');
      const streamingResult = await TrueStreamingVideoUploadService.uploadGoogleDriveVideo({
        googleDriveUrl: options.googleDriveUrl,
        accountId: options.accountId,
        userId: options.userId,
        content: options.content,
        customLabels: options.customLabels,
        language: options.language,
        uploadId
      });

      if (!streamingResult.success) {
        throw new Error(streamingResult.error || 'True streaming upload failed');
      }

      console.log('✅ TRUE STREAMING COMPLETED SUCCESSFULLY');
      
      return {
        success: true,
        facebookVideoId: streamingResult.facebookVideoId,
        facebookPostId: streamingResult.facebookPostId,
        facebookUrl: streamingResult.facebookUrl,
        uploadedSizeMB: streamingResult.sizeMB,
        postId: streamingResult.facebookPostId,
        videoId: streamingResult.facebookVideoId,
        method: 'true_streaming_upload',
        steps: ['True streaming upload completed successfully']
      };
      
    } catch (error) {
      console.error('❌ TRUE STREAMING FAILED:', error);
      
      // DEPRECATED FALLBACK - Only for non-large files and when disk space is sufficient
      console.log('⚠️ Falling back to legacy download method (NOT RECOMMENDED)');
      
      // Re-check disk space for fallback
      const { DiskSpaceMonitor } = await import('./diskSpaceMonitor');
      const spaceCheck = await DiskSpaceMonitor.checkDiskSpace();
      
      if (spaceCheck && (spaceCheck.level === 'critical' || spaceCheck.level === 'emergency')) {
        return {
          success: false,
          error: `Both streaming and fallback blocked due to disk space: ${spaceCheck.message}`,
          method: 'true_streaming_upload',
          steps: ['Upload blocked due to insufficient disk space']
        };
      }
      
      return this.legacyUploadMethod(options, uploadId, steps);
    }
  }

  private async legacyUploadMethod(options: CompleteVideoUploadOptions, uploadId: string, steps: string[]): Promise<CompleteVideoUploadResult> {
    console.log('🚨 USING LEGACY METHOD - THIS SHOULD BE PHASED OUT');
    
    try {
      // Initialize progress tracking
      progressTracker.updateProgress(uploadId, 'Using legacy download method...', 5, 'Fallback to old download + upload process');
      
      // Step 1: Get Facebook account details
      const account = await storage.getFacebookAccount(options.accountId);
      if (!account) {
        throw new Error('Facebook account not found');
      }
      
      steps.push('Facebook account validated');
      console.log(`Using Facebook account: ${account.name} (${account.pageId})`);
      
      // Step 2: Download from Google Drive using enhanced downloader
      console.log('Step 1: Downloading from Google Drive with token confirmation');
      steps.push('Starting Google Drive download');
      
      // Progress tracking for download start
      progressTracker.updateProgress(uploadId, 'Downloading from Google Drive...', 15, 'Enhanced downloader with token confirmation initiated');
      
      const downloadResult = await this.downloader.downloadVideoFile({
        googleDriveUrl: options.googleDriveUrl
      });
      
      if (!downloadResult.success) {
        throw new Error(`Google Drive download failed: ${downloadResult.error}`);
      }
      
      if (!downloadResult.filePath || !downloadResult.fileSize) {
        throw new Error('Download completed but file information missing');
      }
      
      const downloadSizeMB = downloadResult.fileSize / (1024 * 1024);
      steps.push(`Downloaded: ${downloadSizeMB.toFixed(1)}MB`);
      console.log(`Download successful: ${downloadSizeMB.toFixed(1)}MB`);
      
      // Progress tracking for download complete
      progressTracker.updateProgress(uploadId, 'Download completed, starting Facebook upload...', 40, `Downloaded ${downloadSizeMB.toFixed(1)}MB from Google Drive`);
      
      // Step 3: Upload to Facebook using chunked upload
      console.log('Step 2: Uploading to Facebook using chunked upload API');
      steps.push('Starting Facebook chunked upload');
      
      // Progress tracking for upload start
      progressTracker.updateProgress(uploadId, 'Processing video with FFmpeg...', 50, 'Preparing video for Facebook upload with chunked method');
      
      // Use the actual CSV content as both title and description to preserve original content
      const title = options.content || 'Google Drive Video Upload';
      const description = options.content || `Video uploaded from Google Drive (${downloadSizeMB.toFixed(1)}MB)`;
      
      const uploadResult = await this.uploader.uploadVideoInChunks({
        accessToken: account.accessToken,
        pageId: account.pageId,
        filePath: downloadResult.filePath,
        title: title,
        description: description,
        customLabels: options.customLabels,
        language: options.language
      });
      
      if (!uploadResult.success) {
        throw new Error(`Facebook upload failed: ${uploadResult.error}`);
      }
      
      const uploadSizeMB = (uploadResult.totalSize || 0) / (1024 * 1024);
      steps.push(`Uploaded: ${uploadSizeMB.toFixed(1)}MB`);
      steps.push('Chunked upload completed');
      
      // Progress tracking for upload complete
      progressTracker.updateProgress(uploadId, 'Facebook upload completed!', 95, `Uploaded ${uploadSizeMB.toFixed(1)}MB video to Facebook successfully`);
      
      console.log(`Upload successful: ${uploadResult.videoId}`);
      console.log(`Facebook URL: ${uploadResult.facebookUrl}`);
      
      // Step 4: Wait for Facebook processing and get post ID
      console.log('Step 3: Waiting for Facebook processing');
      steps.push('Waiting for Facebook processing');
      
      // Progress tracking for Facebook processing
      progressTracker.updateProgress(uploadId, 'Facebook processing video...', 98, 'Video uploaded successfully, waiting for Facebook processing to complete');
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
      
      // Get recent posts to find the uploaded video
      const posts = await this.getRecentFacebookPosts(account.accessToken, account.pageId);
      const videoPost = posts.find(post => 
        post.attachments?.data?.[0]?.type === 'video_inline' &&
        (Date.now() - new Date(post.created_time).getTime()) < 5 * 60 * 1000 // Within 5 minutes
      );
      
      let facebookPostId = videoPost?.id;
      
      if (facebookPostId) {
        steps.push('Video post identified');
        console.log(`Facebook Post ID: ${facebookPostId}`);
      } else {
        steps.push('Video uploaded, post ID pending');
        console.log('Video uploaded successfully, post ID will be available after processing');
      }
      
      // Step 5: Clean up downloaded file
      try {
        unlinkSync(downloadResult.filePath);
        console.log(`🗑️  Cleaned up downloaded file: ${downloadResult.filePath}`);
      } catch (cleanupError) {
        console.error('Warning: Failed to clean up downloaded file:', cleanupError);
      }
      
      // Final progress update
      progressTracker.updateProgress(uploadId, 'Upload process completed!', 100, 'Google Drive video successfully uploaded to Facebook using legacy chunked method');
      
      return {
        success: true,
        facebookVideoId: uploadResult.videoId,
        facebookPostId: facebookPostId,
        facebookUrl: uploadResult.facebookUrl,
        downloadedSize: downloadResult.fileSize,
        uploadedSize: uploadResult.totalSize,
        uploadedSizeMB: uploadSizeMB,
        postId: facebookPostId,
        videoId: uploadResult.videoId,
        method: 'google_drive_chunked_upload',
        steps: steps
      };
      
    } catch (error) {
      console.error('Legacy upload method failed:', error);
      steps.push(`Error: ${(error as Error).message}`);
      
      return {
        success: false,
        error: (error as Error).message,
        method: 'google_drive_chunked_upload',
        steps: steps
      };
    }
  }

  async getRecentFacebookPosts(accessToken: string, pageId: string): Promise<any[]> {
    try {
      const fetch = (await import('node-fetch')).default;
      const url = `https://graph.facebook.com/v20.0/${pageId}/posts?fields=id,created_time,attachments{type,media_type}&limit=10&access_token=${accessToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      return data.data || [];
    } catch (error) {
      console.error('Error fetching recent posts:', error);
      return [];
    }
  }

  async testGoogleDriveChunkedUpload(googleDriveUrl: string): Promise<CompleteVideoUploadResult> {
    try {
      const accounts = await storage.getFacebookAccounts(3);
      const tamilAccount = accounts.find(acc => acc.name.includes('Alright Tamil'));
      
      if (!tamilAccount) {
        throw new Error('Alright Tamil account not found');
      }
      
      console.log('Testing Google Drive chunked upload with Alright Tamil page');
      
      return await this.uploadGoogleDriveVideoInChunks({
        googleDriveUrl: googleDriveUrl,
        accountId: tamilAccount.id,
        userId: 3,
        content: 'Test upload from Google Drive using chunked method'
      });
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        method: 'google_drive_chunked_upload'
      };
    }
  }
}