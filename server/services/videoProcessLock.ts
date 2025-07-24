/**
 * Video Process Lock Service
 * Prevents multiple concurrent video processing operations that can cause resource conflicts
 */
export class VideoProcessLock {
  private static locks = new Map<string, boolean>();
  private static timeouts = new Map<string, NodeJS.Timeout>();
  
  /**
   * Acquire lock for a video processing operation
   */
  static async acquireLock(url: string): Promise<boolean> {
    const lockKey = this.generateLockKey(url);
    
    if (this.locks.get(lockKey)) {
      console.log(`🔒 Video processing already in progress for: ${lockKey}`);
      return false;
    }
    
    this.locks.set(lockKey, true);
    
    // Auto-release lock after 30 minutes to prevent permanent locks
    const timeout = setTimeout(() => {
      this.releaseLock(url);
      console.log(`⏰ Auto-released lock for: ${lockKey} after 30 minutes`);
    }, 30 * 60 * 1000);
    
    this.timeouts.set(lockKey, timeout);
    
    console.log(`🔓 Acquired processing lock for: ${lockKey}`);
    return true;
  }
  
  /**
   * Release lock for a video processing operation
   */
  static releaseLock(url: string): void {
    const lockKey = this.generateLockKey(url);
    
    this.locks.delete(lockKey);
    
    const timeout = this.timeouts.get(lockKey);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(lockKey);
    }
    
    console.log(`🔓 Released processing lock for: ${lockKey}`);
  }
  
  /**
   * Check if a video is currently being processed
   */
  static isLocked(url: string): boolean {
    const lockKey = this.generateLockKey(url);
    return this.locks.get(lockKey) === true;
  }
  
  /**
   * Generate a consistent lock key from URL
   */
  private static generateLockKey(url: string): string {
    // Extract file ID or use hash of URL
    const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)|id=([a-zA-Z0-9-_]+)/);
    if (fileIdMatch) {
      return fileIdMatch[1] || fileIdMatch[2];
    }
    
    // Fallback to URL hash
    return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  }
  
  /**
   * Get all active locks (for debugging)
   */
  static getActiveLocks(): string[] {
    return Array.from(this.locks.keys());
  }
  
  /**
   * Clear all locks (for testing/cleanup)
   */
  static clearAllLocks(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.locks.clear();
    this.timeouts.clear();
    console.log('🔓 Cleared all video processing locks');
  }
}