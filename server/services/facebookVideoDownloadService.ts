import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class FacebookVideoDownloadService {
  /**
   * Download a video from Facebook using various link formats
   * Supports both mobile and desktop Facebook video URLs
   */
  static async downloadFromFacebook(facebookUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('🔗 Processing Facebook video URL:', facebookUrl);
      
      // Extract video information and get download URL
      const videoInfo = await this.extractVideoInfo(facebookUrl);
      
      if (!videoInfo.success || !videoInfo.downloadUrl) {
        return { 
          success: false, 
          error: videoInfo.error || 'Unable to extract Facebook video download URL. The video may be private or restricted.' 
        };
      }

      console.log('📥 Downloading Facebook video from:', videoInfo.downloadUrl);

      // Download the video
      const response = await fetch(videoInfo.downloadUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Range': 'bytes=0-', // Support partial content
          'Connection': 'keep-alive'
        },
        timeout: 300000, // 5 minute timeout
        follow: 10
      });

      if (!response.ok) {
        console.error('❌ Facebook video download failed:', response.status, response.statusText);
        
        if (response.status === 403) {
          return { 
            success: false, 
            error: 'Access denied. The Facebook video may be private or require authentication. Please ensure the video is publicly accessible.' 
          };
        }
        
        if (response.status === 404) {
          return { 
            success: false, 
            error: 'Facebook video not found. Please check the URL and ensure the video exists.' 
          };
        }

        return { 
          success: false, 
          error: `Facebook video download failed: ${response.status} ${response.statusText}` 
        };
      }

      // Get content length for progress tracking
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      console.log(`📊 Facebook video size: ${(contentLength / (1024 * 1024)).toFixed(2)} MB`);

      // Ensure download directory exists
      const downloadDir = path.dirname(downloadPath);
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // Stream download to file
      const fileStream = fs.createWriteStream(downloadPath);
      let downloadedBytes = 0;

      return new Promise((resolve) => {
        if (!response.body) {
          resolve({ success: false, error: 'No response body from Facebook' });
          return;
        }

        response.body.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const progress = contentLength > 0 ? (downloadedBytes / contentLength * 100).toFixed(1) : 'unknown';
          if (downloadedBytes % (5 * 1024 * 1024) === 0) { // Log every 5MB
            console.log(`📥 Facebook video download progress: ${progress}%`);
          }
        });

        response.body.on('error', (error: Error) => {
          console.error('❌ Facebook video download stream error:', error);
          fileStream.destroy();
          if (fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
          }
          resolve({ success: false, error: `Download stream error: ${error.message}` });
        });

        response.body.on('end', () => {
          fileStream.end();
        });

        fileStream.on('finish', () => {
          const stats = fs.statSync(downloadPath);
          console.log(`✅ Facebook video download completed: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
          
          resolve({ 
            success: true, 
            filePath: downloadPath, 
            sizeBytes: stats.size 
          });
        });

        fileStream.on('error', (error: Error) => {
          console.error('❌ Facebook video file write error:', error);
          if (fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
          }
          resolve({ success: false, error: `File write error: ${error.message}` });
        });

        response.body.pipe(fileStream);
      });

    } catch (error) {
      console.error('❌ Facebook video download error:', error);
      
      // Clean up partial download
      if (fs.existsSync(downloadPath)) {
        try {
          fs.unlinkSync(downloadPath);
        } catch (cleanupError) {
          console.error('⚠️ Failed to clean up partial download:', cleanupError);
        }
      }

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown Facebook video download error' 
      };
    }
  }

  /**
   * Extract video information from Facebook URL
   */
  private static async extractVideoInfo(facebookUrl: string): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
    try {
      // Normalize Facebook URL
      const normalizedUrl = this.normalizeFacebookUrl(facebookUrl);
      
      console.log('🔍 Extracting video info from:', normalizedUrl);

      // Fetch the Facebook page to extract video URL
      const response = await fetch(normalizedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 30000
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to access Facebook page: ${response.status} ${response.statusText}`
        };
      }

      const html = await response.text();

      // Extract video URL patterns from Facebook page HTML
      const videoUrlPatterns = [
        /"browser_native_hd_url":"([^"]+)"/,
        /"browser_native_sd_url":"([^"]+)"/,
        /"playable_url":"([^"]+)"/,
        /"playable_url_quality_hd":"([^"]+)"/,
        /hd_src:"([^"]+)"/,
        /sd_src:"([^"]+)"/,
        /"video_url":"([^"]+)"/
      ];

      for (const pattern of videoUrlPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          // Decode the URL (Facebook uses Unicode escaping)
          const videoUrl = match[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\u003D/g, '=')
            .replace(/\\u0025/g, '%')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');
          
          console.log('✅ Found Facebook video URL:', videoUrl.substring(0, 100) + '...');
          return {
            success: true,
            downloadUrl: videoUrl
          };
        }
      }

      // If direct extraction fails, try alternative methods
      console.log('⚠️ Direct extraction failed, trying alternative methods...');
      
      // Look for video_id and try to construct download URL
      const videoIdMatch = html.match(/video_id[":"]*(\d+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        console.log('📱 Found video ID, attempting alternative extraction...');
        // This would require additional Facebook API calls or third-party services
        // For now, return an error suggesting manual download
        return {
          success: false,
          error: 'Unable to extract video download URL automatically. This video may require manual download or the use of a specialized Facebook video downloader.'
        };
      }

      return {
        success: false,
        error: 'Could not extract video download URL from Facebook page. The video may be private, restricted, or the page format has changed.'
      };

    } catch (error) {
      console.error('❌ Error extracting Facebook video info:', error);
      return {
        success: false,
        error: `Failed to extract video information: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Normalize Facebook URL to a standard format
   */
  private static normalizeFacebookUrl(facebookUrl: string): string {
    try {
      // Convert mobile URLs to desktop format
      let url = facebookUrl
        .replace('m.facebook.com', 'www.facebook.com')
        .replace('mobile.facebook.com', 'www.facebook.com');

      // Ensure proper protocol
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }

      return url;

    } catch (error) {
      console.error('❌ Error normalizing Facebook URL:', error);
      return facebookUrl;
    }
  }

  /**
   * Validate if a URL appears to be a Facebook video link
   */
  static isFacebookVideoUrl(url: string): boolean {
    return (url.includes('facebook.com') || url.includes('fb.com')) && 
           (url.includes('/videos/') || url.includes('/video/') || url.includes('v='));
  }

  /**
   * Extract filename from Facebook URL
   */
  static extractFilename(facebookUrl: string): string {
    try {
      // Try to extract video ID from URL
      const videoIdMatch = facebookUrl.match(/videos\/(\d+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        return `facebook_video_${videoIdMatch[1]}.mp4`;
      }

      // Fallback to timestamp-based filename
      return `facebook_video_${Date.now()}.mp4`;
      
    } catch (error) {
      console.error('❌ Error extracting Facebook filename:', error);
      return `facebook_video_${Date.now()}.mp4`;
    }
  }
}