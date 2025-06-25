import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * Guaranteed video upload service that ensures actual video files are uploaded to Facebook
 * Uses progressive quality reduction and multiple upload methods
 */
export class GuaranteedVideoUploadService {
  
  /**
   * Upload video with guaranteed success - tries multiple approaches until one works
   */
  static async uploadWithGuarantee(
    pageId: string, 
    pageAccessToken: string, 
    filePath: string, 
    description?: string, 
    customLabels?: string[], 
    language?: string
  ): Promise<{
    success: boolean;
    postId?: string;
    method?: string;
    finalSize?: number;
    error?: string;
  }> {
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
    console.log('🎯 GUARANTEED VIDEO UPLOAD: Starting progressive upload strategies');
    
    const originalStats = statSync(filePath);
    const originalSizeMB = originalStats.size / 1024 / 1024;
    
    // Strategy 1: Direct upload if reasonable size
    if (originalSizeMB < 100) {
      console.log(`📤 STRATEGY 1: Direct upload (${originalSizeMB.toFixed(2)}MB)`);
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, filePath, description, customLabels, language, () => {}
      );
      if (result.success) {
        return { ...result, method: 'direct', finalSize: originalStats.size };
      }
    }
    
    // Strategy 2: Chunked upload for large files
    console.log(`📤 STRATEGY 2: Chunked upload (${originalSizeMB.toFixed(2)}MB)`);
    const chunkedResult = await HootsuiteStyleFacebookService.uploadLargeVideoFileChunked(
      pageId, pageAccessToken, filePath, description, customLabels, language, () => {}
    );
    if (chunkedResult.success) {
      return { ...chunkedResult, method: 'chunked', finalSize: originalStats.size };
    }
    
    // Strategy 3: Quality optimization while preserving detail
    console.log('📤 STRATEGY 3: Quality optimization');
    const optimizedResult = await this.createOptimizedVersion(filePath);
    if (optimizedResult.success && optimizedResult.optimizedPath) {
      const optimizedUpload = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, optimizedResult.optimizedPath, description, customLabels, language, optimizedResult.cleanup
      );
      if (optimizedUpload.success) {
        return { ...optimizedUpload, method: 'optimized', finalSize: optimizedResult.finalSize };
      }
    }
    
    // Strategy 4: Smart compression with quality preservation
    console.log('📤 STRATEGY 4: Smart compression');
    const compressedResult = await this.createSmartCompressed(filePath);
    if (compressedResult.success && compressedResult.compressedPath) {
      const compressedUpload = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, compressedResult.compressedPath, description, customLabels, language, compressedResult.cleanup
      );
      if (compressedUpload.success) {
        return { ...compressedUpload, method: 'smart_compressed', finalSize: compressedResult.finalSize };
      }
    }
    
    // Strategy 5: Facebook-specific encoding
    console.log('📤 STRATEGY 5: Facebook-specific encoding');
    const facebookResult = await this.createFacebookSpecific(filePath);
    if (facebookResult.success && facebookResult.facebookPath) {
      const facebookUpload = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, facebookResult.facebookPath, description, customLabels, language, facebookResult.cleanup
      );
      if (facebookUpload.success) {
        return { ...facebookUpload, method: 'facebook_specific', finalSize: facebookResult.finalSize };
      }
    }
    
    return {
      success: false,
      error: 'All guaranteed upload strategies failed'
    };
  }
  
  /**
   * Create optimized version maintaining good quality
   */
  static async createOptimizedVersion(filePath: string): Promise<{
    success: boolean;
    optimizedPath?: string;
    finalSize?: number;
    cleanup?: () => void;
  }> {
    try {
      const optimizedPath = `/tmp/optimized_${Date.now()}.mp4`;
      
      // Use spawn to avoid fluent-ffmpeg issues
      const { spawn } = await import('child_process');
      
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', filePath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-crf', '20', // High quality
          '-preset', 'medium',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'high',
          '-level', '4.0',
          '-b:a', '128k',
          '-y',
          optimizedPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve(null);
          else reject(new Error(`FFmpeg exit code: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (existsSync(optimizedPath)) {
        const stats = statSync(optimizedPath);
        console.log(`✅ OPTIMIZED VERSION: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        return {
          success: true,
          optimizedPath,
          finalSize: stats.size,
          cleanup: () => {
            if (existsSync(optimizedPath)) {
              unlinkSync(optimizedPath);
              console.log('🗑️ OPTIMIZED VIDEO CLEANED');
            }
          }
        };
      }
      
      return { success: false };
      
    } catch (error) {
      console.log('⚠️ Optimization failed:', error);
      return { success: false };
    }
  }
  
  /**
   * Create smart compressed version
   */
  static async createSmartCompressed(filePath: string): Promise<{
    success: boolean;
    compressedPath?: string;
    finalSize?: number;
    cleanup?: () => void;
  }> {
    try {
      const compressedPath = `/tmp/smart_compressed_${Date.now()}.mp4`;
      
      const { spawn } = await import('child_process');
      
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', filePath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-crf', '23', // Balanced quality/size
          '-preset', 'faster',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'baseline',
          '-level', '3.1',
          '-maxrate', '5M',
          '-bufsize', '10M',
          '-b:a', '96k',
          '-y',
          compressedPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve(null);
          else reject(new Error(`FFmpeg exit code: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (existsSync(compressedPath)) {
        const stats = statSync(compressedPath);
        console.log(`✅ SMART COMPRESSED: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        return {
          success: true,
          compressedPath,
          finalSize: stats.size,
          cleanup: () => {
            if (existsSync(compressedPath)) {
              unlinkSync(compressedPath);
              console.log('🗑️ COMPRESSED VIDEO CLEANED');
            }
          }
        };
      }
      
      return { success: false };
      
    } catch (error) {
      console.log('⚠️ Smart compression failed:', error);
      return { success: false };
    }
  }
  
  /**
   * Create Facebook-specific version
   */
  static async createFacebookSpecific(filePath: string): Promise<{
    success: boolean;
    facebookPath?: string;
    finalSize?: number;
    cleanup?: () => void;
  }> {
    try {
      const facebookPath = `/tmp/facebook_specific_${Date.now()}.mp4`;
      
      const { spawn } = await import('child_process');
      
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', filePath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-s', '1280x720', // Facebook recommended
          '-r', '30',
          '-crf', '25',
          '-preset', 'fast',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-maxrate', '2M',
          '-bufsize', '4M',
          '-b:a', '64k',
          '-y',
          facebookPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve(null);
          else reject(new Error(`FFmpeg exit code: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (existsSync(facebookPath)) {
        const stats = statSync(facebookPath);
        console.log(`✅ FACEBOOK SPECIFIC: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        
        return {
          success: true,
          facebookPath,
          finalSize: stats.size,
          cleanup: () => {
            if (existsSync(facebookPath)) {
              unlinkSync(facebookPath);
              console.log('🗑️ FACEBOOK VIDEO CLEANED');
            }
          }
        };
      }
      
      return { success: false };
      
    } catch (error) {
      console.log('⚠️ Facebook-specific encoding failed:', error);
      return { success: false };
    }
  }
}