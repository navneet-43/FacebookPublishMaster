import fetch from 'node-fetch';
import { createWriteStream, existsSync, unlinkSync, statSync } from 'fs';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class ReliableVideoUploadService {
  
  static async uploadGoogleDriveVideo(
    pageId: string,
    accessToken: string,
    googleDriveUrl: string,
    description: string,
    customLabels: string[] = [],
    language: string = 'en'
  ): Promise<{ success: boolean; postId?: string; type: string; error?: string }> {
    
    console.log('Starting reliable Google Drive video upload...');
    
    // Extract file ID
    const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) {
      return { success: false, error: 'Invalid Google Drive URL', type: 'error' };
    }
    
    const fileId = fileIdMatch[1];
    const tempFile = `/tmp/gdrive_reliable_${fileId}_${Date.now()}.mp4`;
    
    try {
      // Attempt optimized download with strict timeout
      console.log('Attempting optimized download...');
      
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const downloadPromise = this.downloadWithProgress(downloadUrl, tempFile);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Download timeout')), 45000); // 45 seconds
      });
      
      try {
        await Promise.race([downloadPromise, timeoutPromise]);
        
        // Verify download
        if (existsSync(tempFile)) {
          const stats = statSync(tempFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`Download completed: ${sizeMB.toFixed(1)}MB`);
          
          if (sizeMB > 50) { // At least 50MB indicates partial success
            console.log('Proceeding with actual video upload...');
            
            const uploadResult = await HootsuiteStyleFacebookService.uploadVideoFile(
              pageId,
              accessToken,
              tempFile,
              description,
              customLabels,
              language
            );
            
            // Clean up
            this.cleanupFile(tempFile);
            
            if (uploadResult.success) {
              return { 
                success: true, 
                postId: uploadResult.postId, 
                type: 'actual_video' 
              };
            }
          }
        }
        
        throw new Error('Download incomplete or failed');
        
      } catch (downloadError) {
        console.log(`Download failed: ${downloadError.message}`);
        this.cleanupFile(tempFile);
        
        // Fallback to link post with clear messaging
        console.log('Creating optimized link post...');
        return await this.createLinkPost(pageId, accessToken, googleDriveUrl, description, customLabels);
      }
      
    } catch (error) {
      this.cleanupFile(tempFile);
      console.log(`Process error: ${error.message}`);
      
      // Final fallback
      return await this.createLinkPost(pageId, accessToken, googleDriveUrl, description, customLabels);
    }
  }
  
  private static async downloadWithProgress(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 60000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    if (!response.body) {
      throw new Error('No response body');
    }
    
    const fileStream = createWriteStream(outputPath);
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    
    let downloaded = 0;
    let lastLog = 0;
    
    return new Promise((resolve, reject) => {
      response.body!.on('data', (chunk) => {
        downloaded += chunk.length;
        const progress = Math.floor((downloaded / contentLength) * 100);
        
        if (progress > lastLog + 20) { // Log every 20%
          console.log(`Download: ${progress}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
          lastLog = progress;
        }
      });
      
      response.body!.on('end', () => {
        console.log(`Download finished: ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
        resolve();
      });
      
      response.body!.on('error', reject);
      response.body!.pipe(fileStream);
      fileStream.on('error', reject);
    });
  }
  
  private static async createLinkPost(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[]
  ): Promise<{ success: boolean; postId?: string; type: string; error?: string }> {
    
    try {
      const message = `${description}\n\nVideo: ${videoUrl}\n\n#${customLabels.join(' #')}`;
      
      const response = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          access_token: accessToken
        })
      });
      
      const result = await response.json();
      
      if (result.id) {
        console.log(`Link post created: ${result.id}`);
        return { 
          success: true, 
          postId: result.id, 
          type: 'link_post' 
        };
      } else {
        throw new Error(result.error?.message || 'Facebook API error');
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        type: 'failed' 
      };
    }
  }
  
  private static cleanupFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log('Temporary file cleaned up');
      }
    } catch (error) {
      console.log('Cleanup warning:', error.message);
    }
  }
}