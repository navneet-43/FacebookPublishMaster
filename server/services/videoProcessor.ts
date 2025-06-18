import fetch from 'node-fetch';
import { createWriteStream, createReadStream, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';

export interface VideoProcessingResult {
  success: boolean;
  processedUrl?: string;
  originalSize?: number;
  processedSize?: number;
  error?: string;
  skipProcessing?: boolean;
  cleanup?: () => void;
}

/**
 * Video processing service for Facebook-compatible uploads
 * Handles YouTube downloads, compression, format conversion, and size optimization
 */
export class VideoProcessor {
  
  // Facebook's video requirements
  static readonly MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
  static readonly RECOMMENDED_SIZE = 100 * 1024 * 1024; // 100MB for better upload success
  static readonly SUPPORTED_FORMATS = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'];
  static readonly MAX_DURATION = 240 * 60; // 240 minutes
  static readonly TEMP_DIR = join(process.cwd(), 'temp');

  /**
   * Check if video needs processing based on size and format
   */
  static async analyzeVideo(url: string): Promise<{
    needsProcessing: boolean;
    reason?: string;
    estimatedSize?: number;
    contentType?: string;
  }> {
    try {
      console.log('🔍 ANALYZING VIDEO:', url);
      
      // Handle YouTube URLs - download and upload as video file
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        console.log('🎥 PROCESSING YOUTUBE URL for download and Facebook upload');
        
        const { YouTubeHelper } = await import('./youtubeHelper');
        
        const videoId = YouTubeHelper.extractVideoId(url);
        if (!videoId) {
          throw new Error('Invalid YouTube URL format. Please ensure the URL contains a valid video ID.\n\nSupported formats:\n• youtube.com/watch?v=VIDEO_ID\n• youtu.be/VIDEO_ID');
        }
        
        console.log(`🎥 YOUTUBE VIDEO ID: ${videoId}`);
        
        // YouTube videos will be downloaded and uploaded as files
        // Check if video is accessible first
        try {
          const validation = await YouTubeHelper.validateForFacebook(url);
          if (!validation.isValid) {
            throw new Error(validation.error || 'YouTube video cannot be accessed for download');
          }
          
          // Return needs processing to trigger download
          return {
            needsProcessing: true,
            reason: 'YouTube video will be downloaded and uploaded as video file',
            estimatedSize: 0, // Will be determined during download
            contentType: 'video/mp4'
          };
        } catch (error) {
          throw new Error(`YouTube video access error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // For Google Drive URLs, use comprehensive helper to find working access URL
      if (url.includes('drive.google.com')) {
        const { GoogleDriveHelper } = await import('./googleDriveHelper');
        const result = await GoogleDriveHelper.findWorkingVideoUrl(url);
        
        if (result.workingUrl) {
          console.log('✅ Google Drive access successful');
          return {
            needsProcessing: false,
            reason: 'Google Drive video accessible',
            estimatedSize: result.size,
            contentType: result.contentType
          };
        } else {
          // No working URL found, create detailed error
          const fileId = GoogleDriveHelper.extractFileId(url);
          const errorMessage = GoogleDriveHelper.generateErrorMessage(fileId || 'unknown', result.testedUrls);
          
          return {
            needsProcessing: true,
            reason: errorMessage,
            estimatedSize: 0,
            contentType: 'text/html'
          };
        }
      }
      
      // Handle Vimeo URLs with early validation
      if (url.includes('vimeo.com')) {
        console.log('🎬 PROCESSING VIMEO URL for Facebook upload');
        
        const { VimeoHelper } = await import('./vimeoHelper');
        
        // First check if we can get video info
        const videoId = VimeoHelper.extractVideoId(url);
        if (!videoId) {
          throw new Error('Invalid Vimeo URL format. Please ensure the URL contains a valid video ID.');
        }
        
        // Get video information to verify it exists
        const videoInfo = await VimeoHelper.getVideoInfo(videoId);
        if (!videoInfo.success) {
          throw new Error(`Vimeo video not accessible: ${videoInfo.error}\n\nPlease ensure:\n1. Video exists and is public/unlisted\n2. Video is not private or password protected`);
        }
        
        // Try to get optimized URL
        const optimizeResult = await VimeoHelper.getOptimizedUrl(url);
        if (optimizeResult.workingUrl && optimizeResult.workingUrl !== url) {
          console.log('🎬 VIMEO URL OPTIMIZATION successful');
          return {
            needsProcessing: false,
            reason: 'Vimeo video optimized and accessible',
            estimatedSize: optimizeResult.size,
            contentType: optimizeResult.contentType
          };
        } else {
          // Video info accessible but optimization failed
          const setupMessage = VimeoHelper.generateSetupInstructions(videoId);
          return {
            needsProcessing: true,
            reason: setupMessage,
            estimatedSize: 0,
            contentType: 'text/html'
          };
        }
      }
      
      // Handle Dropbox URLs
      if (url.includes('dropbox.com')) {
        console.log('📦 PROCESSING DROPBOX URL');
        
        const { DropboxHelper } = await import('./dropboxHelper');
        const optimized = DropboxHelper.getOptimizedUrl(url);
        
        if (optimized.workingUrl) {
          return {
            needsProcessing: false,
            reason: 'Dropbox URL optimized for direct access',
            estimatedSize: optimized.size,
            contentType: optimized.contentType
          };
        }
      }
      
      // For other URLs, do a standard HTTP check
      console.log('🌐 CHECKING STANDARD VIDEO URL');
      
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`Video URL not accessible (${response.status}): ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength, 10) : 0;
      
      console.log(`📊 VIDEO INFO: ${(size / 1024 / 1024).toFixed(2)}MB, ${contentType}`);
      
      if (size > this.RECOMMENDED_SIZE) {
        return {
          needsProcessing: true,
          reason: `Large file warning: ${(size / 1024 / 1024).toFixed(2)}MB may cause upload timeouts. Consider using Facebook resumable upload for files over 100MB.`,
          estimatedSize: size,
          contentType
        };
      }
      
      return {
        needsProcessing: false,
        reason: 'Video is ready for upload',
        estimatedSize: size,
        contentType
      };
      
    } catch (error) {
      console.error('❌ VIDEO ANALYSIS ERROR:', error);
      throw error;
    }
  }

  /**
   * Process video for Facebook upload
   */
  static async processVideo(url: string): Promise<VideoProcessingResult> {
    try {
      console.log('🎬 STARTING VIDEO PROCESSING:', url);
      
      const analysis = await this.analyzeVideo(url);
      
      // Handle YouTube downloads
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        console.log('🎥 PROCESSING YOUTUBE VIDEO DOWNLOAD');
        
        const { YouTubeHelper } = await import('./youtubeHelper');
        
        try {
          const downloadResult = await YouTubeHelper.downloadVideo(url);
          
          if (!downloadResult.isValid || !downloadResult.filePath) {
            return {
              success: false,
              error: 'Failed to download YouTube video. Please ensure the video is public or unlisted and accessible for download.'
            };
          }
          
          console.log(`✅ YOUTUBE VIDEO DOWNLOADED: ${downloadResult.size} bytes`);
          
          return {
            success: true,
            processedUrl: downloadResult.filePath,
            originalSize: downloadResult.size,
            processedSize: downloadResult.size,
            skipProcessing: false,
            cleanup: downloadResult.cleanup
          };
          
        } catch (error) {
          return {
            success: false,
            error: `YouTube download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }
      }
      
      if (!analysis.needsProcessing) {
        console.log('✅ VIDEO PROCESSING SKIPPED: Video is ready for upload');
        
        // Determine final URL based on analysis
        let finalUrl = url;
        
        // For Google Drive, use the working URL from analysis
        if (url.includes('drive.google.com')) {
          const { GoogleDriveHelper } = await import('./googleDriveHelper');
          const result = await GoogleDriveHelper.findWorkingVideoUrl(url);
          if (result.workingUrl) {
            finalUrl = result.workingUrl;
          }
        }
        
        // For Vimeo, use optimized URL
        if (url.includes('vimeo.com')) {
          const { VimeoHelper } = await import('./vimeoHelper');
          const optimized = await VimeoHelper.getOptimizedUrl(url);
          if (optimized.workingUrl) {
            finalUrl = optimized.workingUrl;
          }
        }
        
        // For Dropbox, use optimized URL
        if (url.includes('dropbox.com')) {
          const { DropboxHelper } = await import('./dropboxHelper');
          const optimized = DropboxHelper.getOptimizedUrl(url);
          if (optimized.workingUrl) {
            finalUrl = optimized.workingUrl;
          }
        }
        
        // Log warning for large files but don't prevent upload
        if (analysis.reason && analysis.reason.includes('Large file warning')) {
          console.log('⚠️ LARGE VIDEO WARNING:', analysis.reason);
        } else {
          console.log('✅ VIDEO READY: Proceeding with upload');
        }
        
        return {
          success: true,
          processedUrl: finalUrl,
          skipProcessing: true,
          originalSize: analysis.estimatedSize
        };
      }

      // Return processing recommendations instead of actual processing
      return {
        success: false,
        error: analysis.reason || 'Video processing required but not implemented',
        originalSize: analysis.estimatedSize
      };

    } catch (error) {
      console.error('❌ VIDEO PROCESSING ERROR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video processing failed'
      };
    }
  }
}