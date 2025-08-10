import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class EnhancedSharePointDownloadService {
  /**
   * Download SharePoint video with robust error handling and multiple strategies
   */
  static async downloadFromSharePoint(sharePointUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    console.log('🔗 Enhanced SharePoint Download - Processing URL:', sharePointUrl);
    
    try {
      // Strategy 1: Extract file path from redirect and build direct download URL
      const result1 = await this.tryDirectFileAccess(sharePointUrl, downloadPath);
      if (result1.success && result1.sizeBytes && result1.sizeBytes > 100000) {
        console.log('✅ Strategy 1 (Direct File Access) succeeded');
        return result1;
      }
      
      // Strategy 2: Use SharePoint REST API
      const result2 = await this.tryRestApiAccess(sharePointUrl, downloadPath);
      if (result2.success && result2.sizeBytes && result2.sizeBytes > 100000) {
        console.log('✅ Strategy 2 (REST API) succeeded');
        return result2;
      }
      
      // Strategy 3: Try with browser-like session
      const result3 = await this.tryBrowserSession(sharePointUrl, downloadPath);
      if (result3.success && result3.sizeBytes && result3.sizeBytes > 100000) {
        console.log('✅ Strategy 3 (Browser Session) succeeded');
        return result3;
      }

      return {
        success: false,
        error: 'All SharePoint download strategies failed. File may require authentication or have restricted permissions.'
      };

    } catch (error) {
      console.error('❌ Enhanced SharePoint download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SharePoint download error'
      };
    }
  }

  /**
   * Strategy 1: Direct file access using extracted path
   */
  private static async tryDirectFileAccess(sharePointUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('📥 Strategy 1: Attempting direct file access...');
      
      // Get the redirect URL
      const response = await fetch(sharePointUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (response.status === 302) {
        const redirectUrl = response.headers.get('location');
        if (redirectUrl && redirectUrl.includes('stream.aspx')) {
          const streamUrl = new URL(redirectUrl);
          const fileId = streamUrl.searchParams.get('id');
          
          if (fileId) {
            const decodedPath = decodeURIComponent(fileId);
            console.log('🔍 Extracted file path:', decodedPath);
            
            const baseUrl = `${streamUrl.protocol}//${streamUrl.hostname}`;
            
            // Try multiple direct access URLs
            const directUrls = [
              `${baseUrl}${decodedPath}?download=1`,
              `${baseUrl}${decodedPath}?web=1&download=1`,
              `${baseUrl}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(decodedPath)}`,
              `${baseUrl}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(baseUrl + decodedPath)}`
            ];

            for (const url of directUrls) {
              console.log('🔗 Trying direct URL:', url);
              const result = await this.downloadFileWithValidation(url, downloadPath, 'Direct Access');
              if (result.success && result.sizeBytes && result.sizeBytes > 100000) {
                return result;
              }
            }
          }
        }
      }

      return { success: false, error: 'Could not extract file path from SharePoint redirect' };
    } catch (error) {
      console.error('❌ Strategy 1 failed:', error);
      return { success: false, error: `Direct access failed: ${error}` };
    }
  }

  /**
   * Strategy 2: SharePoint REST API access
   */
  private static async tryRestApiAccess(sharePointUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('📥 Strategy 2: Attempting REST API access...');
      
      // Get file path from redirect
      const response = await fetch(sharePointUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.status === 302) {
        const redirectUrl = response.headers.get('location');
        if (redirectUrl && redirectUrl.includes('stream.aspx')) {
          const streamUrl = new URL(redirectUrl);
          const fileId = streamUrl.searchParams.get('id');
          
          if (fileId) {
            const decodedPath = decodeURIComponent(fileId);
            const baseUrl = `${streamUrl.protocol}//${streamUrl.hostname}`;
            
            // Build REST API URLs
            const restUrls = [
              `${baseUrl}/_api/web/getfilebyserverrelativeurl('${decodedPath}')/$value`,
              `${baseUrl}/_vti_bin/listdata.svc/Documents('${decodedPath}')/$value`,
              `${baseUrl}/_api/v2.0/shares/u!${Buffer.from(baseUrl + decodedPath).toString('base64')}/driveItem/content`
            ];

            for (const url of restUrls) {
              console.log('🔗 Trying REST API URL:', url);
              const result = await this.downloadFileWithValidation(url, downloadPath, 'REST API');
              if (result.success && result.sizeBytes && result.sizeBytes > 100000) {
                return result;
              }
            }
          }
        }
      }

      return { success: false, error: 'REST API access failed' };
    } catch (error) {
      console.error('❌ Strategy 2 failed:', error);
      return { success: false, error: `REST API failed: ${error}` };
    }
  }

  /**
   * Strategy 3: Browser-like session with cookies
   */
  private static async tryBrowserSession(sharePointUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('📥 Strategy 3: Attempting browser session...');
      
      // First, establish a session by visiting the URL
      const sessionResponse = await fetch(sharePointUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      // Extract cookies
      const setCookieHeaders = sessionResponse.headers.raw()['set-cookie'];
      const cookies = setCookieHeaders ? setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ') : '';
      
      if (cookies) {
        console.log('🍪 Obtained session cookies, attempting authenticated download...');
        
        // Now try download with session cookies
        const url = new URL(sharePointUrl);
        url.searchParams.set('download', '1');
        
        const result = await this.downloadFileWithValidation(url.toString(), downloadPath, 'Browser Session', cookies);
        if (result.success && result.sizeBytes && result.sizeBytes > 100000) {
          return result;
        }
      }

      return { success: false, error: 'Browser session approach failed' };
    } catch (error) {
      console.error('❌ Strategy 3 failed:', error);
      return { success: false, error: `Browser session failed: ${error}` };
    }
  }

  /**
   * Download file with validation and enhanced error handling
   */
  private static async downloadFileWithValidation(
    url: string, 
    downloadPath: string, 
    strategy: string, 
    cookies?: string
  ): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // Prevent compression issues
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      };

      if (cookies) {
        headers['Cookie'] = cookies;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        timeout: 300000, // 5 minute timeout
        follow: 10
      });

      if (!response.ok) {
        console.log(`⚠️ ${strategy}: HTTP ${response.status} ${response.statusText}`);
        return { success: false, error: `${strategy}: HTTP ${response.status}` };
      }

      // Validate content type
      const contentType = response.headers.get('content-type') || '';
      console.log(`📊 ${strategy}: Content-Type: ${contentType}`);
      
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        console.log(`⚠️ ${strategy}: Received ${contentType} instead of video file`);
        return { success: false, error: `${strategy}: Wrong content type: ${contentType}` };
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      console.log(`📊 ${strategy}: Content-Length: ${(contentLength / (1024 * 1024)).toFixed(2)} MB`);

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
          resolve({ success: false, error: `${strategy}: No response body` });
          return;
        }

        response.body.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes % (5 * 1024 * 1024) === 0) { // Log every 5MB
            const progress = contentLength > 0 ? (downloadedBytes / contentLength * 100).toFixed(1) : 'unknown';
            console.log(`📥 ${strategy}: Progress: ${progress}% (${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB)`);
          }
        });

        response.body.on('error', (error: Error) => {
          console.error(`❌ ${strategy}: Stream error:`, error);
          fileStream.destroy();
          if (fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
          }
          resolve({ success: false, error: `${strategy}: Stream error` });
        });

        response.body.on('end', () => {
          fileStream.end();
        });

        fileStream.on('finish', () => {
          const stats = fs.statSync(downloadPath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`✅ ${strategy}: Download completed: ${sizeMB} MB`);
          
          resolve({ 
            success: true, 
            filePath: downloadPath, 
            sizeBytes: stats.size 
          });
        });

        fileStream.on('error', (error: Error) => {
          console.error(`❌ ${strategy}: Write error:`, error);
          if (fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
          }
          resolve({ success: false, error: `${strategy}: Write error` });
        });

        response.body.pipe(fileStream);
      });

    } catch (error) {
      console.error(`❌ ${strategy}: Download failed:`, error);
      return { 
        success: false, 
        error: `${strategy}: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Validate if a URL appears to be a SharePoint link
   */
  static isSharePointUrl(url: string): boolean {
    return url.includes('sharepoint.com') || 
           url.includes('1drv.ms') || 
           url.includes('onedrive.live.com') ||
           url.includes('officeapps.live.com');
  }

  /**
   * Extract filename from SharePoint URL
   */
  static extractFilename(sharePointUrl: string): string {
    try {
      // Try to extract filename from the URL structure
      const url = new URL(sharePointUrl);
      const pathname = url.pathname;
      
      // Look for file extension in the path
      const segments = pathname.split('/');
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment && segment.includes('.')) {
          return decodeURIComponent(segment);
        }
      }
      
      // Fallback to timestamp-based filename
      return `sharepoint_video_${Date.now()}.mp4`;
      
    } catch (error) {
      console.error('Error extracting filename:', error);
      return `sharepoint_video_${Date.now()}.mp4`;
    }
  }
}