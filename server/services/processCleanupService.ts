import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { glob } from 'glob';

const execAsync = promisify(exec);

/**
 * Process Cleanup Service
 * Manages cleanup of hanging processes and temporary files
 */
export class ProcessCleanupService {
  
  /**
   * Kill all hanging FFmpeg processes
   */
  static async killHangingFFmpegProcesses(): Promise<void> {
    try {
      console.log('🧹 CLEANING UP HANGING FFMPEG PROCESSES...');
      
      // Find all FFmpeg processes
      const { stdout } = await execAsync('ps aux | grep ffmpeg | grep -v grep');
      const processes = stdout.split('\n').filter(line => line.includes('ffmpeg'));
      
      if (processes.length === 0) {
        console.log('✅ No hanging FFmpeg processes found');
        return;
      }
      
      for (const processLine of processes) {
        const parts = processLine.trim().split(/\s+/);
        if (parts.length > 1) {
          const pid = parts[1];
          console.log(`🔫 Killing FFmpeg process: ${pid}`);
          
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`✅ Killed process ${pid}`);
          } catch (error) {
            console.log(`⚠️ Could not kill process ${pid}:`, error);
          }
        }
      }
      
    } catch (error) {
      console.log('ℹ️ No FFmpeg processes found to clean up');
    }
  }
  
  /**
   * Clean up old temporary video files
   */
  static async cleanupTempFiles(): Promise<void> {
    try {
      console.log('🧹 CLEANING UP TEMPORARY FILES...');
      
      // Find all temp video files older than 1 hour
      const tempFiles = [
        '/tmp/google_drive_*.mp4',
        '/tmp/gdrive_video_*.mp4',
        '/tmp/*_simple_fb.mp4',
        '/tmp/youtube_*.mp4'
      ];
      
      let totalCleaned = 0;
      
      for (const pattern of tempFiles) {
        try {
          const files = await this.globFiles(pattern);
          
          for (const file of files) {
            try {
              const stats = fs.statSync(file);
              const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
              
              // Delete files older than 60 minutes
              if (ageMinutes > 60) {
                fs.unlinkSync(file);
                console.log(`🗑️ Deleted old temp file: ${file} (${ageMinutes.toFixed(1)} min old)`);
                totalCleaned++;
              }
              
            } catch (error) {
              console.log(`⚠️ Could not process file ${file}:`, error);
            }
          }
          
        } catch (error) {
          // Pattern not found, continue
        }
      }
      
      console.log(`✅ Cleaned up ${totalCleaned} temporary files`);
      
    } catch (error) {
      console.error('❌ Error during temp file cleanup:', error);
    }
  }
  
  /**
   * Helper to promisify glob
   */
  private static globFiles(pattern: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      glob.glob(pattern, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  }
  
  /**
   * Full system cleanup
   */
  static async performFullCleanup(): Promise<void> {
    console.log('🚀 PERFORMING FULL SYSTEM CLEANUP...');
    
    await this.killHangingFFmpegProcesses();
    await this.cleanupTempFiles();
    
    console.log('✅ FULL CLEANUP COMPLETED');
  }
  
  /**
   * Emergency cleanup for stuck processes
   */
  static async emergencyCleanup(): Promise<void> {
    console.log('🚨 EMERGENCY CLEANUP INITIATED...');
    
    try {
      // Kill all FFmpeg processes immediately
      await execAsync('pkill -9 ffmpeg || true');
      console.log('🔫 Killed all FFmpeg processes');
      
      // Remove all temp files
      await execAsync('rm -f /tmp/google_drive_*.mp4 /tmp/gdrive_video_*.mp4 /tmp/*_simple_fb.mp4 /tmp/youtube_*.mp4 || true');
      console.log('🗑️ Removed all temp video files');
      
      console.log('✅ EMERGENCY CLEANUP COMPLETED');
      
    } catch (error) {
      console.error('❌ Emergency cleanup failed:', error);
    }
  }
}