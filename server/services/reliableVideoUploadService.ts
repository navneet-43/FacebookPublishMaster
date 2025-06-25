import { existsSync, unlinkSync, statSync } from 'fs';
import { spawn } from 'child_process';

/**
 * Reliable video upload service that ensures actual video files are uploaded
 * Uses progressive size reduction with quality preservation
 */
export class ReliableVideoUploadService {
  
  static async uploadVideoReliably(
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
    error?: string;
  }> {
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
    const stats = statSync(filePath);
    const sizeMB = stats.size / 1024 / 1024;
    
    console.log(`🎯 RELIABLE UPLOAD: ${sizeMB.toFixed(2)}MB video`);
    
    // Try direct upload first
    if (sizeMB < 100) {
      console.log('📤 Attempting direct upload');
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, filePath, description, customLabels, language, () => {}
      );
      if (result.success) {
        return { ...result, method: 'direct' };
      }
    }
    
    // Create Facebook-optimized version
    console.log('🔧 Creating Facebook-optimized version');
    const optimizedPath = await this.createOptimizedVideo(filePath);
    
    if (optimizedPath) {
      const optimizedStats = statSync(optimizedPath);
      const optimizedSizeMB = optimizedStats.size / 1024 / 1024;
      
      console.log(`✅ Optimized to ${optimizedSizeMB.toFixed(2)}MB`);
      
      const cleanup = () => {
        if (existsSync(optimizedPath)) {
          unlinkSync(optimizedPath);
          console.log('🗑️ Optimized video cleaned');
        }
      };
      
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, optimizedPath, description, customLabels, language, cleanup
      );
      
      if (result.success) {
        return { ...result, method: 'optimized' };
      }
    }
    
    return {
      success: false,
      error: 'Video upload failed with all methods'
    };
  }
  
  static async createOptimizedVideo(inputPath: string): Promise<string | null> {
    try {
      const outputPath = `/tmp/facebook_optimized_${Date.now()}.mp4`;
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-s', '1280x720',
          '-crf', '23',
          '-preset', 'fast',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'baseline',
          '-level', '3.1',
          '-maxrate', '2M',
          '-bufsize', '4M',
          '-b:a', '128k',
          '-y',
          outputPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg failed with code ${code}`));
          }
        });
        
        ffmpeg.on('error', reject);
      });
      
      return existsSync(outputPath) ? outputPath : null;
      
    } catch (error) {
      console.log('Video optimization failed:', error);
      return null;
    }
  }
}