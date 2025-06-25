import fetch from 'node-fetch';
import { createWriteStream, existsSync, unlinkSync, statSync } from 'fs';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class RobustGoogleDriveService {
  
  static async uploadGoogleDriveVideo(
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
    const tempFile = `/tmp/robust_${fileId}_${Date.now()}.mp4`;
    
    try {
      console.log('Starting robust Google Drive video download...');
      
      // Use streaming download with better error handling
      const downloadSuccess = await this.streamingDownload(fileId, tempFile);
      
      if (!downloadSuccess) {
        this.cleanupFile(tempFile);
        return { 
          success: false, 
          error: 'Google Drive video download failed. File may be access-restricted or too large for current network conditions.' 
        };
      }
      
      // Verify downloaded file
      const stats = statSync(tempFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      if (sizeMB < 5) {
        this.cleanupFile(tempFile);
        return { 
          success: false, 
          error: `Downloaded file too small (${sizeMB.toFixed(1)}MB). Google Drive file may require different access permissions.` 
        };
      }
      
      console.log(`Successfully downloaded ${sizeMB.toFixed(1)}MB Google Drive video`);
      
      // Upload to Facebook
      const uploadResult = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId,
        accessToken,
        tempFile,
        description,
        customLabels,
        language
      );
      
      this.cleanupFile(tempFile);
      
      if (uploadResult.success) {
        console.log(`Facebook upload successful: ${uploadResult.postId}`);
        return { success: true, postId: uploadResult.postId };
      } else {
        return { success: false, error: `Facebook upload failed: ${uploadResult.error}` };
      }
      
    } catch (error) {
      this.cleanupFile(tempFile);
      return { success: false, error: `Process error: ${error.message}` };
    }
  }
  
  private static async streamingDownload(fileId: string, outputPath: string): Promise<boolean> {
    // Use the most reliable Google Drive download URL
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    
    try {
      console.log('Initiating streaming download...');
      
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'video/mp4, video/*, application/octet-stream, */*',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive'
        },
        timeout: 300000, // 5 minutes total timeout
        follow: 10,
        compress: false
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('No response body received');
      }
      
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      console.log(`Starting download: ${(contentLength / 1024 / 1024).toFixed(1)}MB`);
      
      // Check if this looks like an error page
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') && contentLength < 1024 * 1024) {
        throw new Error('Received HTML page instead of video file - likely access restricted');
      }
      
      const fileStream = createWriteStream(outputPath);
      let downloadedBytes = 0;
      let lastProgressTime = Date.now();
      let lastProgressBytes = 0;
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          fileStream.destroy();
          reject(new Error('Download timeout - no progress for 2 minutes'));
        }, 120000); // 2 minute progress timeout
        
        response.body.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          
          // Check for progress every 30 seconds
          if (now - lastProgressTime > 30000) {
            const progressMB = downloadedBytes / (1024 * 1024);
            const speedKBps = (downloadedBytes - lastProgressBytes) / ((now - lastProgressTime) / 1000) / 1024;
            
            console.log(`Downloaded: ${progressMB.toFixed(1)}MB (${speedKBps.toFixed(1)} KB/s)`);
            
            // Reset timeout if we're making progress
            if (downloadedBytes > lastProgressBytes) {
              clearTimeout(timeout);
              setTimeout(() => {
                fileStream.destroy();
                reject(new Error('Download stalled - no progress for 2 minutes'));
              }, 120000);
            }
            
            lastProgressTime = now;
            lastProgressBytes = downloadedBytes;
          }
        });
        
        response.body.on('end', () => {
          clearTimeout(timeout);
          console.log(`Download completed: ${(downloadedBytes / 1024 / 1024).toFixed(1)}MB`);
          resolve(true);
        });
        
        response.body.on('error', (error) => {
          clearTimeout(timeout);
          fileStream.destroy();
          reject(error);
        });
        
        response.body.pipe(fileStream);
        
        fileStream.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error) {
      console.log(`Download failed: ${error.message}`);
      this.cleanupFile(outputPath);
      return false;
    }
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