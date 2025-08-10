import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class FacebookImageDownloadService {
  /**
   * Download an image from Facebook using photo URL
   * Supports Facebook photo URLs with fbid parameter
   */
  static async downloadFromFacebook(facebookUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('🔗 Processing Facebook image URL:', facebookUrl);
      
      // Extract image information and get download URL
      const imageInfo = await this.extractImageInfo(facebookUrl);
      
      if (!imageInfo.success || !imageInfo.downloadUrl) {
        return { 
          success: false, 
          error: imageInfo.error || 'Unable to extract Facebook image download URL. The image may be private or restricted.' 
        };
      }

      console.log('📥 Downloading Facebook image from:', imageInfo.downloadUrl);

      // Download the image
      const response = await fetch(imageInfo.downloadUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/jpeg,image/png,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
          'Referer': 'https://www.facebook.com/'
        },
        timeout: 300000, // 5 minute timeout
        follow: 10
      });

      if (!response.ok) {
        console.error('❌ Facebook image download failed:', response.status, response.statusText);
        
        if (response.status === 403) {
          return { 
            success: false, 
            error: 'Access denied. The Facebook image may be private or require authentication. Please ensure the image is publicly accessible.' 
          };
        }
        
        if (response.status === 404) {
          return { 
            success: false, 
            error: 'Facebook image not found. Please check the URL and ensure the image exists.' 
          };
        }

        return { 
          success: false, 
          error: `Facebook image download failed: ${response.status} ${response.statusText}` 
        };
      }

      // Get content length for progress tracking
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      console.log(`📊 Facebook image size: ${(contentLength / (1024)).toFixed(2)} KB`);

      // Verify content type is an image
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return {
          success: false,
          error: `Expected image content but received: ${contentType}. The URL may not point to a valid image.`
        };
      }

      // Ensure download directory exists
      const downloadDir = path.dirname(downloadPath);
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // Stream download to file
      const fileStream = fs.createWriteStream(downloadPath);
      
      // Pipe the response to file
      const downloadPromise = new Promise<void>((resolve, reject) => {
        response.body?.pipe(fileStream);
        
        fileStream.on('finish', () => {
          resolve();
        });
        
        fileStream.on('error', (error) => {
          console.error('❌ File write error:', error);
          reject(error);
        });

        response.body?.on('error', (error) => {
          console.error('❌ Download stream error:', error);
          reject(error);
        });
      });

      await downloadPromise;
      
      // Get final file size
      const finalSize = fs.statSync(downloadPath).size;
      console.log(`✅ Facebook image downloaded successfully: ${(finalSize / 1024).toFixed(2)} KB`);

      // Verify download integrity
      if (finalSize === 0) {
        throw new Error('Downloaded file is empty');
      }

      if (finalSize < 1024) { // Less than 1KB might indicate an error page
        const fileContent = fs.readFileSync(downloadPath, 'utf8').substring(0, 200);
        if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE')) {
          throw new Error('Downloaded content appears to be HTML instead of an image');
        }
      }

      return {
        success: true,
        filePath: downloadPath,
        sizeBytes: finalSize
      };

    } catch (error) {
      console.error('❌ Facebook image download error:', error);
      
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
        error: error instanceof Error ? error.message : 'Unknown Facebook image download error' 
      };
    }
  }

  /**
   * Extract image information from Facebook URL
   */
  private static async extractImageInfo(facebookUrl: string): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
    try {
      // Normalize Facebook URL
      const normalizedUrl = this.normalizeFacebookUrl(facebookUrl);
      
      console.log('🔍 Extracting image info from:', normalizedUrl);

      // Extract fbid from URL
      const fbidMatch = facebookUrl.match(/fbid=(\d+)/);
      if (!fbidMatch || !fbidMatch[1]) {
        return {
          success: false,
          error: 'Could not extract Facebook image ID (fbid) from URL. Please ensure the URL contains an fbid parameter.'
        };
      }

      const fbid = fbidMatch[1];
      console.log('📱 Found Facebook image ID:', fbid);

      // Fetch the Facebook page to extract image URL
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

      // Extract image URL patterns from Facebook page HTML
      const imageUrlPatterns = [
        new RegExp(`"image":\\s*{[^}]*"uri":\\s*"([^"]+)"[^}]*${fbid}`, 'i'),
        new RegExp(`${fbid}[^"]*"[^"]*"([^"]*\\.(jpg|jpeg|png|webp)[^"]*)"`, 'i'),
        /"og:image"\s*content="([^"]+)"/,
        /"twitter:image"\s*content="([^"]+)"/,
        new RegExp(`"(https://[^"]*fbcdn[^"]*${fbid}[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"`, 'i'),
        new RegExp(`"(https://[^"]*scontent[^"]*${fbid}[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"`, 'i')
      ];

      for (const pattern of imageUrlPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          // Decode the URL (Facebook uses Unicode escaping)
          const imageUrl = match[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\u003D/g, '=')
            .replace(/\\u0025/g, '%')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');
          
          // Verify this looks like a valid image URL
          if (imageUrl.includes('fbcdn') || imageUrl.includes('scontent')) {
            console.log('✅ Found Facebook image URL:', imageUrl.substring(0, 100) + '...');
            return {
              success: true,
              downloadUrl: imageUrl
            };
          }
        }
      }

      // Alternative: Try to construct image URL from fbid
      const constructedUrls = [
        `https://scontent.xx.fbcdn.net/v/t39.30808-6/${fbid}_n.jpg`,
        `https://scontent.xx.fbcdn.net/v/t1.6435-9/${fbid}_n.jpg`,
        `https://external.xx.fbcdn.net/safe_image.php?d=${fbid}&url=`
      ];

      for (const url of constructedUrls) {
        try {
          const testResponse = await fetch(url, { method: 'HEAD', timeout: 10000 });
          if (testResponse.ok && testResponse.headers.get('content-type')?.startsWith('image/')) {
            console.log('✅ Found working constructed URL:', url);
            return {
              success: true,
              downloadUrl: url
            };
          }
        } catch (error) {
          // Continue to next URL
        }
      }

      return {
        success: false,
        error: 'Could not extract image download URL from Facebook page. The image may be private, restricted, or the page format has changed.'
      };

    } catch (error) {
      console.error('❌ Error extracting Facebook image info:', error);
      return {
        success: false,
        error: `Failed to extract image information: ${error instanceof Error ? error.message : 'Unknown error'}`
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
   * Validate if a URL appears to be a Facebook image link
   */
  static isFacebookImageUrl(url: string): boolean {
    return (url.includes('facebook.com') || url.includes('fb.com')) && 
           (url.includes('/photo') || url.includes('fbid='));
  }

  /**
   * Extract filename from Facebook URL
   */
  static extractFilename(facebookUrl: string): string {
    try {
      // Try to extract fbid from URL
      const fbidMatch = facebookUrl.match(/fbid=(\d+)/);
      if (fbidMatch && fbidMatch[1]) {
        return `facebook_image_${fbidMatch[1]}.jpg`;
      }

      // Fallback to timestamp-based filename
      return `facebook_image_${Date.now()}.jpg`;

    } catch (error) {
      console.error('❌ Error extracting filename:', error);
      return `facebook_image_${Date.now()}.jpg`;
    }
  }
}