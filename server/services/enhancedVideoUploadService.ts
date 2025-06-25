import fetch from 'node-fetch';
import { createWriteStream, existsSync, unlinkSync, statSync } from 'fs';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class EnhancedVideoUploadService {
  
  static async uploadActualVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[] = [],
    language: string = 'en'
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    console.log('Starting enhanced actual video upload...');
    
    // For YouTube videos, use existing YouTube processing
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      return await this.processYouTubeVideo(pageId, accessToken, videoUrl, description, customLabels, language);
    }
    
    // For Google Drive videos, use aggressive download strategy
    if (videoUrl.includes('drive.google.com')) {
      return await this.processGoogleDriveVideo(pageId, accessToken, videoUrl, description, customLabels, language);
    }
    
    // For direct video URLs, download and upload
    return await this.processDirectVideoUrl(pageId, accessToken, videoUrl, description, customLabels, language);
  }
  
  private static async processYouTubeVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[],
    language: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    try {
      // Use existing YouTube download and upload functionality
      const result = await HootsuiteStyleFacebookService.publishVideoPost(
        pageId,
        accessToken,
        videoUrl,
        description,
        customLabels,
        language
      );
      
      if (result.success) {
        return { success: true, postId: result.postId };
      } else {
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  private static async processGoogleDriveVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[],
    language: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) {
      return { success: false, error: 'Invalid Google Drive URL format' };
    }
    
    const fileId = fileIdMatch[1];
    const tempFile = `/tmp/enhanced_gdrive_${fileId}_${Date.now()}.mp4`;
    
    try {
      // Try multiple download strategies
      const downloadSuccess = await this.aggressiveGoogleDriveDownload(fileId, tempFile);
      
      if (!downloadSuccess) {
        return { success: false, error: 'Google Drive download failed - unable to access video file' };
      }
      
      // Verify file size
      const stats = statSync(tempFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      if (sizeMB < 10) {
        this.cleanupFile(tempFile);
        return { success: false, error: `Downloaded file too small (${sizeMB.toFixed(1)}MB) - likely access restricted` };
      }
      
      console.log(`Successfully downloaded ${sizeMB.toFixed(1)}MB, uploading to Facebook...`);
      
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
        return { success: true, postId: uploadResult.postId };
      } else {
        return { success: false, error: uploadResult.error };
      }
      
    } catch (error) {
      this.cleanupFile(tempFile);
      return { success: false, error: error.message };
    }
  }
  
  private static async aggressiveGoogleDriveDownload(fileId: string, outputPath: string): Promise<boolean> {
    const downloadUrls = [
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    ];
    
    for (const url of downloadUrls) {
      try {
        console.log(`Attempting download from: ${url.substring(0, 50)}...`);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'video/*, application/octet-stream, */*'
          },
          timeout: 180000, // 3 minutes
          follow: 10
        });
        
        if (!response.ok || !response.body) {
          console.log(`URL failed: ${response.status}`);
          continue;
        }
        
        const contentLength = parseInt(response.headers.get('content-length') || '0');
        
        if (contentLength < 1024 * 1024) { // Less than 1MB likely means error page
          console.log(`Content too small: ${contentLength} bytes`);
          continue;
        }
        
        // Download with progress tracking
        const fileStream = createWriteStream(outputPath);
        let downloaded = 0;
        
        await new Promise((resolve, reject) => {
          response.body.on('data', (chunk) => {
            downloaded += chunk.length;
            if (downloaded % (10 * 1024 * 1024) === 0) { // Log every 10MB
              console.log(`Downloaded: ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
            }
          });
          
          response.body.on('end', resolve);
          response.body.on('error', reject);
          response.body.pipe(fileStream);
          fileStream.on('error', reject);
        });
        
        // Verify download
        if (existsSync(outputPath)) {
          const stats = statSync(outputPath);
          if (stats.size > 10 * 1024 * 1024) { // At least 10MB
            console.log(`Download successful: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
            return true;
          }
        }
        
      } catch (error) {
        console.log(`Download attempt failed: ${error.message}`);
        this.cleanupFile(outputPath);
      }
    }
    
    return false;
  }
  
  private static async processDirectVideoUrl(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[],
    language: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    // Use existing video processing system
    try {
      const result = await HootsuiteStyleFacebookService.publishVideoPost(
        pageId,
        accessToken,
        videoUrl,
        description,
        customLabels,
        language
      );
      
      if (result.success) {
        return { success: true, postId: result.postId };
      } else {
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      return { success: false, error: error.message };
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