import { GoogleDriveHelper } from './googleDriveHelper.js';
import { CorrectGoogleDriveDownloader } from './correctGoogleDriveDownloader.js';
import { FFmpegGoogleDriveService } from './ffmpegGoogleDriveService.js';

interface VideoProcessingResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  method: 'standard' | 'ffmpeg' | 'failed';
  error?: string;
  sizeMB?: number;
}

interface VideoSizeInfo {
  sizeMB: number;
  isLarge: boolean;
  needsFFmpeg: boolean;
  contentType: string | null;
}

/**
 * Intelligent Video Processor
 * Automatically detects video file sizes and selects optimal download method
 */
export class IntelligentVideoProcessor {
  
  // Size thresholds (in MB)
  private static readonly LARGE_FILE_THRESHOLD = 50; // Files > 50MB use FFmpeg
  private static readonly MAX_STANDARD_SIZE = 100;   // Files > 100MB always use FFmpeg
  
  /**
   * Check video file size without downloading the entire file
   */
  static async getVideoSizeInfo(url: string): Promise<VideoSizeInfo> {
    console.log(`🔍 ANALYZING VIDEO SIZE: ${url}`);
    
    try {
      // Extract file ID for Google Drive URLs
      const fileId = GoogleDriveHelper.extractFileId(url);
      if (!fileId) {
        throw new Error('Could not extract Google Drive file ID');
      }
      
      // Test multiple Google Drive access URLs to find the best one
      const accessUrls = GoogleDriveHelper.generateAccessUrls(fileId);
      
      for (const testUrl of accessUrls) {
        try {
          const result = await GoogleDriveHelper.testVideoUrl(testUrl, 15000);
          
          if (result.success && result.size > 0) {
            const sizeMB = result.size / (1024 * 1024);
            const isLarge = sizeMB > this.LARGE_FILE_THRESHOLD;
            const needsFFmpeg = sizeMB > this.MAX_STANDARD_SIZE || 
                               (isLarge && (result.contentType?.includes('video') ?? false));
            
            console.log(`📊 VIDEO SIZE DETECTED: ${sizeMB.toFixed(2)}MB (${result.size} bytes)`);
            console.log(`🎯 PROCESSING METHOD: ${needsFFmpeg ? 'FFmpeg (Large File)' : 'Standard Download'}`);
            
            return {
              sizeMB,
              isLarge,
              needsFFmpeg,
              contentType: result.contentType
            };
          }
        } catch (testError) {
          console.log(`⚠️ URL test failed: ${testUrl} - ${testError}`);
          continue;
        }
      }
      
      // If size detection fails, assume it's large and use FFmpeg
      console.log(`⚠️ Could not detect size, defaulting to FFmpeg method`);
      return {
        sizeMB: 0,
        isLarge: true,
        needsFFmpeg: true,
        contentType: null
      };
      
    } catch (error) {
      console.error(`❌ Size detection error:`, error);
      return {
        sizeMB: 0,
        isLarge: true,
        needsFFmpeg: true,
        contentType: null
      };
    }
  }
  
  /**
   * Process video with automatic method selection based on size
   */
  static async processVideo(url: string, outputPath?: string): Promise<VideoProcessingResult> {
    console.log(`🚀 STARTING INTELLIGENT VIDEO PROCESSING: ${url}`);
    
    try {
      // Step 1: Analyze video size
      console.log(`📊 STEP 1: Analyzing video size...`);
      const sizeInfo = await this.getVideoSizeInfo(url);
      console.log(`📊 VIDEO SIZE ANALYSIS: ${sizeInfo.sizeMB.toFixed(2)}MB, needsFFmpeg: ${sizeInfo.needsFFmpeg}`);
      
      // Step 2: Select processing method based on size
      if (sizeInfo.needsFFmpeg) {
        console.log(`📥 STEP 2: USING FFMPEG METHOD for ${sizeInfo.sizeMB.toFixed(2)}MB video`);
        const result = await this.processWithFFmpeg(url, outputPath, sizeInfo);
        console.log(`📥 FFMPEG RESULT: Success=${result.success}, Method=${result.method}`);
        return result;
      } else {
        console.log(`📥 STEP 2: USING STANDARD METHOD for ${sizeInfo.sizeMB.toFixed(2)}MB video`);
        const result = await this.processWithStandard(url, outputPath, sizeInfo);
        console.log(`📥 STANDARD RESULT: Success=${result.success}, Method=${result.method}`);
        return result;
      }
      
    } catch (error) {
      console.error(`❌ INTELLIGENT PROCESSING FAILED:`, error);
      
      // Emergency fallback to FFmpeg 
      console.log(`🚨 EMERGENCY FALLBACK: Attempting FFmpeg as last resort...`);
      try {
        const fallbackResult = await this.processWithFFmpeg(url, outputPath);
        console.log(`🚨 FALLBACK RESULT: Success=${fallbackResult.success}`);
        return fallbackResult;
      } catch (fallbackError) {
        console.error(`❌ Even fallback failed:`, fallbackError);
        return {
          success: false,
          method: 'failed',
          error: `Primary error: ${error instanceof Error ? error.message : 'Unknown'}, Fallback error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`
        };
      }
    }
  }
  
  /**
   * Process with standard download method (for smaller files)
   */
  private static async processWithStandard(
    url: string, 
    outputPath?: string, 
    sizeInfo?: VideoSizeInfo
  ): Promise<VideoProcessingResult> {
    try {
      const downloader = new CorrectGoogleDriveDownloader();
      const result = await downloader.downloadVideoFile({ 
        googleDriveUrl: url,
        outputPath 
      });
      
      if (result.success && result.filePath) {
        console.log(`✅ STANDARD DOWNLOAD SUCCESS: ${result.fileSize} bytes`);
        return {
          success: true,
          filePath: result.filePath,
          fileSize: result.fileSize,
          method: 'standard',
          sizeMB: (result.fileSize || 0) / (1024 * 1024)
        };
      } else {
        // Fallback to FFmpeg if standard method fails
        console.log(`⚠️ Standard method failed, falling back to FFmpeg`);
        return await this.processWithFFmpeg(url, outputPath, sizeInfo);
      }
      
    } catch (error) {
      console.error(`❌ Standard processing error:`, error);
      // Fallback to FFmpeg
      return await this.processWithFFmpeg(url, outputPath, sizeInfo);
    }
  }
  
  /**
   * Process with FFmpeg method (for larger files or when standard fails)
   */
  private static async processWithFFmpeg(
    url: string, 
    outputPath?: string, 
    sizeInfo?: VideoSizeInfo
  ): Promise<VideoProcessingResult> {
    console.log(`🎬 STARTING FFMPEG PROCESSING for: ${url}`);
    
    try {
      console.log(`🎬 CALLING FFmpegGoogleDriveService.downloadLargeVideo...`);
      const result = await FFmpegGoogleDriveService.downloadLargeVideo(url);
      console.log(`🎬 FFMPEG SERVICE RETURNED: Success=${result.success}, FilePath=${result.filePath}, SizeMB=${result.sizeMB}`);
      
      if (result.success && result.filePath) {
        console.log(`✅ FFMPEG DOWNLOAD SUCCESS: ${result.sizeMB}MB at ${result.filePath}`);
        const fileSize = (result.sizeMB || 0) * 1024 * 1024; // Convert MB to bytes
        
        // Verify file exists
        try {
          const fs = await import('fs');
          const stats = fs.statSync(result.filePath);
          console.log(`✅ FILE VERIFIED: ${stats.size} bytes on disk`);
        } catch (fileError) {
          console.error(`❌ FILE VERIFICATION FAILED:`, fileError);
        }
        
        return {
          success: true,
          filePath: result.filePath,
          fileSize: fileSize,
          method: 'ffmpeg',
          sizeMB: result.sizeMB || 0
        };
      } else {
        console.error(`❌ FFMPEG FAILED: ${result.error}`);
        return {
          success: false,
          method: 'failed',
          error: result.error || 'FFmpeg download failed'
        };
      }
      
    } catch (error) {
      console.error(`❌ FFMPEG PROCESSING EXCEPTION:`, error);
      return {
        success: false,
        method: 'failed',
        error: error instanceof Error ? error.message : 'FFmpeg processing failed'
      };
    }
  }
  
  /**
   * Get recommended processing method without downloading
   */
  static async getRecommendedMethod(url: string): Promise<{
    method: 'standard' | 'ffmpeg';
    reason: string;
    estimatedSize: string;
  }> {
    const sizeInfo = await this.getVideoSizeInfo(url);
    
    if (sizeInfo.needsFFmpeg) {
      return {
        method: 'ffmpeg',
        reason: `Large file (${sizeInfo.sizeMB.toFixed(2)}MB) requires FFmpeg for reliable download`,
        estimatedSize: `${sizeInfo.sizeMB.toFixed(2)}MB`
      };
    } else {
      return {
        method: 'standard',
        reason: `Small to medium file (${sizeInfo.sizeMB.toFixed(2)}MB) can use standard download`,
        estimatedSize: `${sizeInfo.sizeMB.toFixed(2)}MB`
      };
    }
  }
}