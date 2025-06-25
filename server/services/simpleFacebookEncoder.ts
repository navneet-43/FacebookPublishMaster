import { spawn } from 'child_process';
import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * Simple, reliable Facebook video encoder
 * Uses minimal, proven settings for maximum compatibility
 */
export class SimpleFacebookEncoder {
  
  static async createSimpleCompatibleVideo(inputPath: string): Promise<{
    success: boolean;
    outputPath?: string;
    size?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const outputPath = inputPath.replace(/\.(mp4|avi|mov|wmv)$/i, '_simple_fb.mp4');
      
      // Simple, proven FFmpeg settings
      const ffmpegArgs = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Simple encoding failed: ${code}`));
          }
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (!existsSync(outputPath)) {
        return { success: false, error: 'Simple encoding failed' };
      }
      
      const stats = statSync(outputPath);
      
      const cleanup = () => {
        if (existsSync(outputPath)) unlinkSync(outputPath);
      };
      
      return {
        success: true,
        outputPath,
        size: stats.size,
        cleanup
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Simple encoding failed: ${error}`
      };
    }
  }
}