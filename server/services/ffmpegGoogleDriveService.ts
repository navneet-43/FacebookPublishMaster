import { spawn } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class FFmpegGoogleDriveService {
  
  static async downloadAndUploadVideo(
    pageId: string,
    accessToken: string,
    googleDriveUrl: string,
    description: string,
    customLabels: string[] = [],
    language: string = 'en'
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) {
      return { success: false, error: 'Invalid Google Drive URL format' };
    }
    
    const fileId = fileIdMatch[1];
    const outputFile = `/tmp/ffmpeg_gdrive_${fileId}_${Date.now()}.mp4`;
    
    try {
      console.log('Starting FFmpeg-based Google Drive download...');
      
      // Use FFmpeg to download Google Drive video
      const downloadSuccess = await this.downloadWithFFmpeg(fileId, outputFile);
      
      if (!downloadSuccess) {
        this.cleanupFile(outputFile);
        return { 
          success: false, 
          error: 'FFmpeg download failed. Google Drive file may require different access permissions or be too large.' 
        };
      }
      
      // Verify downloaded file
      const stats = statSync(outputFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      if (sizeMB < 1) {
        this.cleanupFile(outputFile);
        return { 
          success: false, 
          error: `Downloaded file too small (${sizeMB.toFixed(1)}MB). Google Drive access may be restricted.` 
        };
      }
      
      console.log(`FFmpeg successfully downloaded ${sizeMB.toFixed(1)}MB Google Drive video`);
      
      // Upload to Facebook using existing service
      const uploadResult = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId,
        accessToken,
        outputFile,
        description,
        customLabels,
        language
      );
      
      this.cleanupFile(outputFile);
      
      if (uploadResult.success) {
        console.log(`Facebook upload successful: ${uploadResult.postId}`);
        return { success: true, postId: uploadResult.postId };
      } else {
        return { success: false, error: `Facebook upload failed: ${uploadResult.error}` };
      }
      
    } catch (error) {
      this.cleanupFile(outputFile);
      return { success: false, error: `FFmpeg process error: ${error.message}` };
    }
  }
  
  private static async downloadWithFFmpeg(fileId: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('Starting FFmpeg download process...');
      
      // Multiple Google Drive URL formats for FFmpeg to try
      const urls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      ];
      
      let currentUrlIndex = 0;
      
      const tryNextUrl = () => {
        if (currentUrlIndex >= urls.length) {
          console.log('All FFmpeg download URLs failed');
          resolve(false);
          return;
        }
        
        const url = urls[currentUrlIndex];
        console.log(`FFmpeg attempting URL ${currentUrlIndex + 1}/${urls.length}...`);
        
        const ffmpegArgs = [
          '-y', // Overwrite output file
          '-i', url,
          '-c', 'copy', // Copy streams without re-encoding for speed
          '-movflags', 'faststart', // Optimize for web playback
          '-f', 'mp4',
          outputPath
        ];
        
        console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));
        
        const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let ffmpegOutput = '';
        let lastProgress = '';
        
        ffmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          ffmpegOutput += output;
          
          // Extract progress information
          const progressMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
          const sizeMatch = output.match(/size=\s*(\d+)kB/);
          
          if (progressMatch && sizeMatch) {
            const currentProgress = `Time: ${progressMatch[1]}, Size: ${sizeMatch[1]}kB`;
            if (currentProgress !== lastProgress) {
              console.log(`FFmpeg progress: ${currentProgress}`);
              lastProgress = currentProgress;
            }
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0 && existsSync(outputPath)) {
            const stats = statSync(outputPath);
            const sizeMB = stats.size / (1024 * 1024);
            
            if (sizeMB > 1) { // At least 1MB indicates success
              console.log(`FFmpeg download successful: ${sizeMB.toFixed(1)}MB`);
              resolve(true);
            } else {
              console.log(`FFmpeg output file too small: ${sizeMB.toFixed(1)}MB`);
              this.cleanupFile(outputPath);
              currentUrlIndex++;
              tryNextUrl();
            }
          } else {
            console.log(`FFmpeg failed with code ${code}`);
            if (ffmpegOutput.includes('HTTP error 403') || ffmpegOutput.includes('403 Forbidden')) {
              console.log('FFmpeg received 403 error - trying next URL...');
            } else if (ffmpegOutput.includes('Invalid data found')) {
              console.log('FFmpeg received invalid data - trying next URL...');
            }
            
            this.cleanupFile(outputPath);
            currentUrlIndex++;
            tryNextUrl();
          }
        });
        
        ffmpeg.on('error', (error) => {
          console.log(`FFmpeg process error: ${error.message}`);
          this.cleanupFile(outputPath);
          currentUrlIndex++;
          tryNextUrl();
        });
        
        // Set timeout for each URL attempt
        setTimeout(() => {
          if (!ffmpeg.killed) {
            console.log('FFmpeg download timeout - trying next URL...');
            ffmpeg.kill('SIGTERM');
            this.cleanupFile(outputPath);
            currentUrlIndex++;
            tryNextUrl();
          }
        }, 180000); // 3 minutes per URL
      };
      
      tryNextUrl();
    });
  }
  
  private static cleanupFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log('Temporary file cleaned up');
      }
    } catch (error) {
      console.log(`Cleanup warning: ${error.message}`);
    }
  }
}