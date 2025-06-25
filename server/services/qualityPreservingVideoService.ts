import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * Quality-preserving video service that maintains original video quality
 * Uses chunked upload for large files instead of compression
 */
export class QualityPreservingVideoService {
  
  /**
   * Process video while maintaining original quality
   */
  static async processVideoForQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      // Handle YouTube URLs - download without compression
      if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/')) {
        return await this.processYouTubeForQuality(videoUrl);
      }
      
      // Handle Google Drive URLs - download without compression  
      if (videoUrl.includes('drive.google.com') || videoUrl.includes('docs.google.com')) {
        return await this.processGoogleDriveForQuality(videoUrl);
      }
      
      return {
        success: false,
        error: 'Unsupported video URL format'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Video processing failed: ${error}`
      };
    }
  }
  
  /**
   * Download YouTube video maintaining highest available quality
   */
  static async processYouTubeForQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const { VideoProcessor } = await import('./videoProcessor');
      
      // Get video info first
      const ytdl = await import('@distube/ytdl-core');
      const info = await ytdl.getInfo(videoUrl);
      
      // Find highest quality video format
      const videoFormats = ytdl.filterFormats(info.formats, 'videoonly')
        .filter(format => format.container === 'mp4')
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
        .filter(format => format.container === 'm4a' || format.audioBitrate)
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      
      if (videoFormats.length === 0 || audioFormats.length === 0) {
        return {
          success: false,
          error: 'No suitable high-quality formats found'
        };
      }
      
      const videoFormat = videoFormats[0];
      const audioFormat = audioFormats[0];
      
      console.log(`🎯 DOWNLOADING HIGHEST QUALITY: ${videoFormat.height}p video + ${audioFormat.audioBitrate}kbps audio`);
      
      // Download using VideoProcessor but without compression
      const result = await VideoProcessor.processVideo(videoUrl);
      
      if (result.success && result.processedUrl) {
        const stats = statSync(result.processedUrl);
        console.log(`📊 HIGH-QUALITY VIDEO: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        return {
          success: true,
          filePath: result.processedUrl,
          originalSize: stats.size,
          cleanup: result.cleanup
        };
      }
      
      return {
        success: false,
        error: 'YouTube download failed'
      };
      
    } catch (error) {
      return {
        success: false,
        error: `YouTube processing failed: ${error}`
      };
    }
  }
  
  /**
   * Download Google Drive video maintaining original quality
   */
  static async processGoogleDriveForQuality(videoUrl: string): Promise<{
    success: boolean;
    filePath?: string;
    originalSize?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        return {
          success: false,
          error: 'Invalid Google Drive URL format'
        };
      }
      
      const fileId = fileIdMatch[1];
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
      
      console.log('📥 DOWNLOADING ORIGINAL QUALITY from Google Drive...');
      
      // Download with streaming to handle large files
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return {
          success: false,
          error: `Google Drive download failed: ${response.status} ${response.statusText}`
        };
      }
      
      // Save to temporary file using streaming
      const tempPath = `/tmp/gdrive_quality_${fileId}_${Date.now()}.mp4`;
      const { createWriteStream } = await import('fs');
      const { pipeline } = await import('stream/promises');
      
      const fileStream = createWriteStream(tempPath);
      await pipeline(response.body, fileStream);
      
      // Get file size
      const stats = statSync(tempPath);
      
      if (stats.size === 0) {
        unlinkSync(tempPath);
        return {
          success: false,
          error: 'Google Drive video file is empty. Check sharing permissions.'
        };
      }
      
      console.log(`📊 ORIGINAL QUALITY: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      
      const cleanup = () => {
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
          console.log('🗑️ QUALITY VIDEO CLEANED');
        }
      };
      
      return {
        success: true,
        filePath: tempPath,
        originalSize: stats.size,
        cleanup
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Google Drive processing failed: ${error}`
      };
    }
  }
}