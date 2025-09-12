import { statSync, readFileSync } from 'fs';
import { spawn } from 'child_process';

export interface DiskSpaceInfo {
  totalMB: number;
  freeMB: number;
  usedMB: number;
  usagePercent: number;
}

export interface DiskSpaceAlert {
  level: 'info' | 'warning' | 'critical' | 'emergency';
  message: string;
  freeMB: number;
  usagePercent: number;
  recommendation: string;
}

export class DiskSpaceMonitor {
  private static readonly WARNING_THRESHOLD = 80; // 80% usage
  private static readonly CRITICAL_THRESHOLD = 90; // 90% usage
  private static readonly EMERGENCY_THRESHOLD = 95; // 95% usage
  private static readonly MIN_FREE_MB = 500; // 500MB minimum free space

  /**
   * Get current disk space information for the root filesystem
   */
  static async getDiskSpaceInfo(): Promise<DiskSpaceInfo | null> {
    try {
      // Use df command to get disk usage for root filesystem
      const dfProcess = spawn('df', ['-m', '/'], { stdio: 'pipe' });
      
      let output = '';
      dfProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      await new Promise((resolve, reject) => {
        dfProcess.on('close', (code) => {
          if (code === 0) resolve(code);
          else reject(new Error(`df command failed with code ${code}`));
        });
      });

      // Parse df output
      const lines = output.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('Invalid df output');
      }

      // Skip header line, get data line
      const dataLine = lines[1].trim().split(/\s+/);
      if (dataLine.length < 4) {
        throw new Error('Cannot parse df output');
      }

      const totalMB = parseInt(dataLine[1]);
      const usedMB = parseInt(dataLine[2]);
      const freeMB = parseInt(dataLine[3]);
      const usagePercent = Math.round((usedMB / totalMB) * 100);

      return {
        totalMB,
        freeMB,
        usedMB,
        usagePercent
      };

    } catch (error) {
      console.error('Failed to get disk space info:', error);
      return null;
    }
  }

  /**
   * Check disk space and return alert level if needed
   */
  static async checkDiskSpace(): Promise<DiskSpaceAlert | undefined> {
    const spaceInfo = await this.getDiskSpaceInfo();
    if (!spaceInfo) {
      return {
        level: 'warning',
        message: 'Unable to determine disk space usage',
        freeMB: 0,
        usagePercent: 0,
        recommendation: 'Check system health and disk monitoring tools'
      };
    }

    const { freeMB, usagePercent } = spaceInfo;

    if (usagePercent >= this.EMERGENCY_THRESHOLD || freeMB < 100) {
      return {
        level: 'emergency',
        message: `CRITICAL: Disk space critically low - ${usagePercent}% used, ${freeMB}MB free`,
        freeMB,
        usagePercent,
        recommendation: 'Immediately stop all video operations and clean up temp files. Consider clearing git history of large files.'
      };
    }

    if (usagePercent >= this.CRITICAL_THRESHOLD || freeMB < 200) {
      return {
        level: 'critical',
        message: `URGENT: Disk space very low - ${usagePercent}% used, ${freeMB}MB free`,
        freeMB,
        usagePercent,
        recommendation: 'Stop video uploads, clean up temp files, and review storage usage immediately.'
      };
    }

    if (usagePercent >= this.WARNING_THRESHOLD || freeMB < this.MIN_FREE_MB) {
      return {
        level: 'warning',
        message: `WARNING: Disk space getting low - ${usagePercent}% used, ${freeMB}MB free`,
        freeMB,
        usagePercent,
        recommendation: 'Clean up temporary files and consider optimizing storage usage.'
      };
    }

    return undefined; // All good
  }

  /**
   * Clean up temporary files and downloads
   */
  static async cleanupTempFiles(): Promise<{ cleaned: boolean; filesRemoved: number; spaceFreesMB: number }> {
    let filesRemoved = 0;
    let spaceFreesMB = 0;

    try {
      console.log('🧹 Starting emergency cleanup of temporary files...');

      // Clean up streaming temp files
      const streamingCleanup = spawn('find', ['/tmp', '-name', 'streaming_*.mp4', '-delete'], { stdio: 'pipe' });
      await new Promise(resolve => streamingCleanup.on('close', resolve));

      // Clean up complete video temp files  
      const completeCleanup = spawn('find', ['/tmp', '-name', 'complete_video_*.mp4', '-delete'], { stdio: 'pipe' });
      await new Promise(resolve => completeCleanup.on('close', resolve));

      // Clean up any other video temp files
      const videoCleanup = spawn('find', ['/tmp', '-name', '*.mp4', '-mtime', '+0', '-delete'], { stdio: 'pipe' });
      await new Promise(resolve => videoCleanup.on('close', resolve));

      // Clean up any temp directories
      const tempDirCleanup = spawn('find', ['./temp', '-type', 'f', '-delete'], { stdio: 'pipe' });
      await new Promise(resolve => tempDirCleanup.on('close', resolve));

      console.log('✅ Temporary file cleanup completed');
      return { cleaned: true, filesRemoved, spaceFreesMB };

    } catch (error) {
      console.error('❌ Failed to cleanup temp files:', error);
      return { cleaned: false, filesRemoved: 0, spaceFreesMB: 0 };
    }
  }

  /**
   * Check if it's safe to proceed with a large file operation
   */
  static async isSafeForLargeOperation(expectedSizeMB: number): Promise<{ safe: boolean; reason?: string }> {
    const spaceInfo = await this.getDiskSpaceInfo();
    if (!spaceInfo) {
      return { safe: false, reason: 'Cannot determine disk space' };
    }

    const { freeMB, usagePercent } = spaceInfo;

    if (usagePercent >= this.CRITICAL_THRESHOLD) {
      return { safe: false, reason: `Disk usage too high: ${usagePercent}%` };
    }

    if (freeMB < (expectedSizeMB * 2 + this.MIN_FREE_MB)) {
      return { 
        safe: false, 
        reason: `Insufficient free space: ${freeMB}MB available, need ${expectedSizeMB * 2 + this.MIN_FREE_MB}MB` 
      };
    }

    return { safe: true };
  }

  /**
   * Start disk space monitoring service
   */
  static startMonitoring(intervalMinutes: number = 5): void {
    console.log(`💿 Starting disk space monitoring (every ${intervalMinutes} minutes)`);
    
    setInterval(async () => {
      const alert = await this.checkDiskSpace();
      if (alert) {
        console.log(`🚨 DISK SPACE ALERT [${alert.level.toUpperCase()}]: ${alert.message}`);
        console.log(`💡 Recommendation: ${alert.recommendation}`);
        
        if (alert.level === 'emergency' || alert.level === 'critical') {
          // Automatically trigger cleanup for critical situations
          console.log('🧹 Triggering automatic cleanup...');
          await this.cleanupTempFiles();
        }
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Get disk space status for API/health checks
   */
  static async getStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'emergency';
    details: DiskSpaceInfo | null;
    alert?: DiskSpaceAlert;
  }> {
    const details = await this.getDiskSpaceInfo();
    const alert = await this.checkDiskSpace();
    
    let status: 'healthy' | 'warning' | 'critical' | 'emergency' = 'healthy';
    
    if (alert) {
      status = alert.level === 'info' ? 'healthy' : alert.level;
    }

    return { status, details, alert };
  }
}