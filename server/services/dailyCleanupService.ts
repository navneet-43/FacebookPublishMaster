import fs from 'fs';
import path from 'path';
import * as schedule from 'node-schedule';
import { execSync } from 'child_process';

export class DailyCleanupService {
  private static isInitialized = false;

  static initialize() {
    if (this.isInitialized) {
      console.log('🧹 Daily cleanup service already initialized');
      return;
    }

    // Schedule daily cleanup at 3 AM IST (21:30 UTC)
    const cleanupJob = schedule.scheduleJob('30 21 * * *', () => {
      this.performDailyCleanup();
    });

    // Also run cleanup on startup
    this.performDailyCleanup();

    this.isInitialized = true;
    console.log('🧹 Daily cleanup service initialized - will run every day at 3:00 AM IST');
  }

  static async performDailyCleanup() {
    console.log('🧹 Starting daily video cleanup to prevent ENOSPC...');
    
    try {
      const tmpDir = '/tmp';
      const files = fs.readdirSync(tmpDir);
      
      let deletedCount = 0;
      let freedSpaceMB = 0;
      
      for (const file of files) {
        const filePath = path.join(tmpDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          
          // Delete video files (various extensions) and working files
          if (this.isVideoFile(file) || this.isWorkingFile(file)) {
            const sizeBytes = stats.size;
            const sizeMB = sizeBytes / (1024 * 1024);
            
            fs.unlinkSync(filePath);
            deletedCount++;
            freedSpaceMB += sizeMB;
            
            console.log(`🗑️ Deleted: ${file} (${sizeMB.toFixed(1)}MB)`);
          }
        } catch (error: any) {
          // Skip files that can't be accessed (might be in use)
          console.log(`⏭️ Skipped: ${file} (${error.message})`);
        }
      }
      
      console.log(`✅ Cleanup complete: ${deletedCount} files deleted, ${freedSpaceMB.toFixed(1)}MB freed`);
      
      // Check remaining disk space
      await this.checkDiskSpace();
      
    } catch (error) {
      console.error('❌ Daily cleanup failed:', error);
    }
  }

  private static isVideoFile(filename: string): boolean {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
    const lowerFilename = filename.toLowerCase();
    return videoExtensions.some(ext => lowerFilename.endsWith(ext));
  }

  private static isWorkingFile(filename: string): boolean {
    const workingPatterns = [
      'working_',
      'download_',
      'temp_video_',
      'google_drive_',
      'facebook_video_',
      'aria2c_',
      'curl_download_'
    ];
    
    return workingPatterns.some(pattern => filename.includes(pattern));
  }

  private static async checkDiskSpace() {
    try {
      const result = execSync('df -h /tmp', { encoding: 'utf8' });
      const lines = result.split('\n');
      
      if (lines.length > 1) {
        const diskInfo = lines[1].split(/\s+/);
        const used = diskInfo[2];
        const available = diskInfo[3];
        const usePercent = diskInfo[4];
        
        console.log(`💾 Disk space - Used: ${used}, Available: ${available}, Usage: ${usePercent}`);
        
        // Warning if disk usage is high
        const usageNumber = parseInt(usePercent.replace('%', ''));
        if (usageNumber > 85) {
          console.warn(`⚠️ High disk usage detected: ${usePercent}`);
        } else {
          console.log(`✅ Disk usage healthy: ${usePercent}`);
        }
      }
    } catch (error: any) {
      console.log('💾 Could not check disk space:', error.message);
    }
  }

  // Manual cleanup trigger for testing
  static async manualCleanup() {
    console.log('🧹 Manual cleanup triggered');
    await this.performDailyCleanup();
  }
}