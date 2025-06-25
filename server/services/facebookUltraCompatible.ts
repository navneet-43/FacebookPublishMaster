import { spawn } from 'child_process';
import { existsSync, unlinkSync, statSync } from 'fs';

/**
 * Ultra-compatible Facebook video encoder
 * Uses the most conservative settings for guaranteed Facebook compatibility
 */
export class FacebookUltraCompatible {
  
  /**
   * Create ultra-compatible video with baseline profile and conservative settings
   */
  static async createUltraCompatibleVideo(inputPath: string): Promise<{
    success: boolean;
    outputPath?: string;
    size?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    try {
      const outputPath = inputPath.replace(/\.(mp4|avi|mov|wmv)$/i, '_ultra_fb.mp4');
      
      console.log('🛠️ Creating ultra-compatible Facebook video...');
      
      // Ultra-conservative FFmpeg settings for maximum Facebook compatibility
      const ffmpegArgs = [
        '-i', inputPath,
        
        // Video codec - most conservative settings
        '-c:v', 'libx264',
        '-profile:v', 'baseline',     // Baseline profile - most compatible
        '-level', '3.0',              // Level 3.0 - universal support
        '-crf', '28',                 // Higher CRF for smaller files
        '-preset', 'slow',            // Better compression efficiency
        
        // Audio codec - simple settings
        '-c:a', 'aac',
        '-ar', '44100',
        '-b:a', '96k',                // Conservative audio bitrate
        '-ac', '2',                   // Stereo
        
        // Video parameters - conservative
        '-pix_fmt', 'yuv420p',        // Standard pixel format
        '-r', '25',                   // Conservative frame rate
        '-g', '50',                   // GOP size
        '-keyint_min', '25',          // Minimum keyframe interval
        
        // Size and bitrate limits
        '-maxrate', '1500k',          // Conservative max bitrate
        '-bufsize', '3000k',          // Buffer size
        
        // Dimension constraints - ensure even numbers and reasonable size
        '-vf', 'scale=min(1280\\,iw):min(720\\,ih):force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=black',
        
        // Container and metadata
        '-movflags', '+faststart',    // Web optimization
        '-f', 'mp4',                  // MP4 container
        
        // Error handling and compatibility
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts',
        '-max_muxing_queue_size', '1024',
        '-threads', '4',              // Limit thread usage
        
        // Remove problematic metadata
        '-map_metadata', '-1',        // Remove all metadata
        '-map_chapters', '-1',        // Remove chapters
        
        '-y',                         // Overwrite output
        outputPath
      ];
      
      console.log('🔧 Ultra-compatible encoding parameters:');
      console.log('   Profile: H.264 Baseline');
      console.log('   Level: 3.0');
      console.log('   Max Resolution: 1280x720');
      console.log('   Frame Rate: 25fps');
      console.log('   Max Bitrate: 1.5Mbps');
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        let lastProgress = '';
        
        ffmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          
          // Extract progress information
          if (output.includes('time=')) {
            const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2})/);
            const sizeMatch = output.match(/size=\s*(\d+)kB/);
            
            if (timeMatch && timeMatch[1] !== lastProgress) {
              lastProgress = timeMatch[1];
              const size = sizeMatch ? `${sizeMatch[1]}kB` : '';
              console.log(`🛠️ ULTRA-COMPATIBLE: ${timeMatch[1]} ${size}`);
            }
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('✅ ULTRA-COMPATIBLE ENCODING COMPLETED');
            resolve();
          } else {
            reject(new Error(`Ultra-compatible encoding failed with code ${code}`));
          }
        });
        
        ffmpeg.on('error', (error) => {
          reject(new Error(`FFmpeg process error: ${error.message}`));
        });
      });
      
      if (!existsSync(outputPath)) {
        return { success: false, error: 'Ultra-compatible video file was not created' };
      }
      
      const stats = statSync(outputPath);
      const sizeMB = stats.size / 1024 / 1024;
      
      console.log(`📊 ULTRA-COMPATIBLE VIDEO: ${sizeMB.toFixed(2)}MB`);
      console.log('✅ Video optimized for maximum Facebook compatibility');
      
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
      console.error('❌ Ultra-compatible encoding failed:', error);
      return {
        success: false,
        error: `Ultra-compatible encoding failed: ${error}`
      };
    }
  }
}