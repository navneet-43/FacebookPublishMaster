import { spawn } from 'child_process';
import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * Facebook-optimized video compression service
 * Ensures maximum compatibility with Facebook's video processing system
 */
export class FacebookOptimizedCompression {
  
  /**
   * Create Facebook-optimized video with guaranteed display compatibility
   */
  static async createOptimizedVideo(inputPath: string): Promise<{
    success: boolean;
    outputPath?: string;
    size?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      if (!existsSync(inputPath)) {
        return { success: false, error: `Input file not found: ${inputPath}` };
      }
      
      const outputPath = inputPath.replace(/\.(mp4|avi|mov|wmv)$/i, '_facebook_optimized.mp4');
      
      console.log('🔧 Creating Facebook-optimized video for guaranteed compatibility...');
      
      // Facebook-optimized FFmpeg settings based on official recommendations
      const ffmpegArgs = [
        '-i', inputPath,
        
        // Video codec settings (Facebook requirements)
        '-c:v', 'libx264',           // H.264 codec (Facebook standard)
        '-profile:v', 'baseline',     // Baseline profile for maximum compatibility
        '-level', '3.0',              // Level 3.0 for universal device support
        
        // Audio codec settings (Facebook requirements)
        '-c:a', 'aac',                // AAC audio codec
        '-ar', '44100',               // 44.1kHz sample rate
        '-b:a', '128k',               // 128kbps audio bitrate
        '-ac', '2',                   // Stereo audio channels
        
        // Video quality and format settings
        '-crf', '23',                 // Constant Rate Factor (good quality)
        '-preset', 'medium',          // Encoding speed vs compression balance
        '-pix_fmt', 'yuv420p',        // Standard pixel format
        '-r', '30',                   // 30 FPS (Facebook recommended)
        
        // Container and streaming optimization
        '-movflags', '+faststart',    // Optimize for web streaming
        '-f', 'mp4',                  // MP4 container format
        
        // Dimension and timestamp fixes
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // Ensure even dimensions
        '-avoid_negative_ts', 'make_zero',           // Fix timestamp issues
        '-fflags', '+genpts',                        // Generate timestamps
        
        // Error handling and compatibility
        '-max_muxing_queue_size', '9999',           // Handle large files
        '-strict', 'experimental',                   // Allow experimental features
        
        '-y',                         // Overwrite output file
        outputPath
      ];
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let progress = '';
        
        ffmpeg.stderr.on('data', (data) => {
          progress = data.toString();
          if (progress.includes('time=')) {
            const timeMatch = progress.match(/time=(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
              console.log(`🔧 OPTIMIZATION PROGRESS: ${timeMatch[1]}`);
            }
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('✅ FACEBOOK OPTIMIZATION COMPLETED');
            resolve();
          } else {
            reject(new Error(`FFmpeg optimization failed with code ${code}`));
          }
        });
        
        ffmpeg.on('error', (error) => {
          reject(new Error(`FFmpeg process error: ${error.message}`));
        });
      });
      
      if (!existsSync(outputPath)) {
        return { success: false, error: 'Optimized video file was not created' };
      }
      
      const stats = statSync(outputPath);
      const sizeMB = stats.size / 1024 / 1024;
      
      console.log(`📊 FACEBOOK-OPTIMIZED VIDEO: ${sizeMB.toFixed(2)}MB`);
      
      const cleanup = () => {
        if (existsSync(outputPath)) {
          unlinkSync(outputPath);
          console.log('🗑️ OPTIMIZED VIDEO CLEANED');
        }
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
        error: `Facebook optimization failed: ${error}`
      };
    }
  }
  
  /**
   * Create ultra-compatible video for problematic files
   */
  static async createUltraCompatibleVideo(inputPath: string): Promise<{
    success: boolean;
    outputPath?: string;
    size?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const outputPath = inputPath.replace(/\.(mp4|avi|mov|wmv)$/i, '_ultra_compatible.mp4');
      
      console.log('🛠️ Creating ultra-compatible video for maximum Facebook reliability...');
      
      // Ultra-conservative settings for maximum compatibility
      const ffmpegArgs = [
        '-i', inputPath,
        
        // Most conservative codec settings
        '-c:v', 'libx264',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-crf', '28',                 // Higher compression for smaller file
        '-preset', 'slow',            // Better compression
        
        // Conservative audio settings
        '-c:a', 'aac',
        '-ar', '44100',
        '-b:a', '96k',                // Lower bitrate for compatibility
        '-ac', '2',
        
        // Conservative video settings
        '-pix_fmt', 'yuv420p',
        '-r', '25',                   // Lower frame rate
        '-maxrate', '2M',             // Conservative bitrate limit
        '-bufsize', '4M',
        
        // Maximum compatibility filters
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,scale=trunc(iw/2)*2:trunc(ih/2)*2',
        
        // Container optimization
        '-movflags', '+faststart',
        '-f', 'mp4',
        
        // Error prevention
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts',
        '-max_muxing_queue_size', '1024',
        
        '-y',
        outputPath
      ];
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('time=')) {
            const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
              console.log(`🛠️ ULTRA-COMPATIBLE PROGRESS: ${timeMatch[1]}`);
            }
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('✅ ULTRA-COMPATIBLE VIDEO CREATED');
            resolve();
          } else {
            reject(new Error(`Ultra-compatible encoding failed: ${code}`));
          }
        });
        
        ffmpeg.on('error', reject);
      });
      
      const stats = statSync(outputPath);
      const sizeMB = stats.size / 1024 / 1024;
      
      console.log(`📊 ULTRA-COMPATIBLE VIDEO: ${sizeMB.toFixed(2)}MB`);
      
      const cleanup = () => {
        if (existsSync(outputPath)) {
          unlinkSync(outputPath);
          console.log('🗑️ ULTRA-COMPATIBLE VIDEO CLEANED');
        }
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
        error: `Ultra-compatible encoding failed: ${error}`
      };
    }
  }
}