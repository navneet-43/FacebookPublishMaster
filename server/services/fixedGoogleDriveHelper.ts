import fetch from 'node-fetch';
import { createWriteStream, existsSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';

export class FixedGoogleDriveHelper {
  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  static async downloadVideo(fileId: string, outputPath: string): Promise<{ success: boolean; size?: number; error?: string }> {
    console.log(`Starting fixed Google Drive download for file ID: ${fileId}`);
    
    // Use the most reliable download URL
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    
    try {
      console.log('Initiating download request...');
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 60000, // 1 minute timeout for initial response
        follow: 10
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      console.log(`Starting download: ${(contentLength / 1024 / 1024).toFixed(2)}MB`);

      if (!response.body) {
        throw new Error('No response body received');
      }

      // Create write stream and download with progress tracking
      const fileStream = createWriteStream(outputPath);
      let downloadedBytes = 0;
      let lastProgress = 0;

      // Transform stream to track progress
      const progressStream = new (require('stream').Transform)({
        transform(chunk: any, encoding: any, callback: any) {
          downloadedBytes += chunk.length;
          const progress = Math.floor((downloadedBytes / contentLength) * 100);
          
          if (progress > lastProgress + 10) { // Log every 10%
            console.log(`Download progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB)`);
            lastProgress = progress;
          }
          
          callback(null, chunk);
        }
      });

      // Use pipeline for proper error handling
      await pipeline(response.body, progressStream, fileStream);

      // Verify file was downloaded correctly
      if (existsSync(outputPath)) {
        const stats = statSync(outputPath);
        const finalSizeMB = stats.size / (1024 * 1024);
        
        console.log(`Download completed: ${finalSizeMB.toFixed(2)}MB`);
        
        if (stats.size > 1024 * 1024) { // At least 1MB
          return { success: true, size: stats.size };
        } else {
          throw new Error(`Downloaded file too small: ${finalSizeMB.toFixed(2)}MB`);
        }
      } else {
        throw new Error('Download file not created');
      }

    } catch (error) {
      console.log(`Download failed: ${error.message}`);
      
      // Clean up partial file
      if (existsSync(outputPath)) {
        try {
          require('fs').unlinkSync(outputPath);
        } catch (e) {}
      }
      
      return { success: false, error: error.message };
    }
  }

  static async processGoogleDriveVideo(url: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputPath = `/tmp/gdrive_${fileId}_${Date.now()}.mp4`;
    
    console.log(`Processing Google Drive video: ${fileId}`);
    const result = await this.downloadVideo(fileId, outputPath);
    
    if (result.success) {
      return { success: true, filePath: outputPath };
    } else {
      return { success: false, error: result.error };
    }
  }
}