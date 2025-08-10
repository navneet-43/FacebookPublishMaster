import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class SharePointDownloadService {
  /**
   * Download a file from SharePoint using various link formats
   * Supports both direct download links and view links
   */
  static async downloadFromSharePoint(sharePointUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('🔗 Processing SharePoint URL:', sharePointUrl);
      
      // Convert SharePoint view link to direct download link
      const downloadUrl = this.convertToDirectDownloadUrl(sharePointUrl);
      
      if (!downloadUrl) {
        return { 
          success: false, 
          error: 'Invalid SharePoint URL format. Please provide a valid SharePoint file link.' 
        };
      }

      console.log('📥 Downloading from SharePoint:', downloadUrl);

      // Create download request with SharePoint-specific headers
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity', // Prevent compression issues
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 300000, // 5 minute timeout
        follow: 10 // Follow redirects
      });

      if (!response.ok) {
        console.error('❌ SharePoint download failed:', response.status, response.statusText);
        
        if (response.status === 403) {
          return { 
            success: false, 
            error: 'Access denied. The SharePoint file may be private or require authentication. Please ensure the file is publicly accessible or shared with "Anyone with the link".' 
          };
        }
        
        if (response.status === 404) {
          return { 
            success: false, 
            error: 'SharePoint file not found. Please check the URL and ensure the file exists.' 
          };
        }

        return { 
          success: false, 
          error: `SharePoint download failed: ${response.status} ${response.statusText}` 
        };
      }

      // Get content length for progress tracking
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      console.log(`📊 SharePoint file size: ${(contentLength / (1024 * 1024)).toFixed(2)} MB`);

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
          resolve({ success: false, error: 'No response body from SharePoint' });
          return;
        }

        response.body.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const progress = contentLength > 0 ? (downloadedBytes / contentLength * 100).toFixed(1) : 'unknown';
          if (downloadedBytes % (5 * 1024 * 1024) === 0) { // Log every 5MB
            console.log(`📥 SharePoint download progress: ${progress}%`);
          }
        });

        response.body.on('error', (error: Error) => {
          console.error('❌ SharePoint download stream error:', error);
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
          console.log(`✅ SharePoint download completed: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
          
          resolve({ 
            success: true, 
            filePath: downloadPath, 
            sizeBytes: stats.size 
          });
        });

        fileStream.on('error', (error: Error) => {
          console.error('❌ SharePoint file write error:', error);
          if (fs.existsSync(downloadPath)) {
            fs.unlinkSync(downloadPath);
          }
          resolve({ success: false, error: `File write error: ${error.message}` });
        });

        response.body.pipe(fileStream);
      });

    } catch (error) {
      console.error('❌ SharePoint download error:', error);
      
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
        error: error instanceof Error ? error.message : 'Unknown SharePoint download error' 
      };
    }
  }

  /**
   * Convert SharePoint view URL to direct download URL
   */
  private static convertToDirectDownloadUrl(sharePointUrl: string): string | null {
    try {
      // Handle different SharePoint URL formats
      if (sharePointUrl.includes('sharepoint.com') || sharePointUrl.includes('1drv.ms')) {
        
        // Format 1: Direct OneForce/SharePoint download link
        if (sharePointUrl.includes('download=1') || sharePointUrl.includes('&download')) {
          return sharePointUrl;
        }

        // Format 2: OneDrive sharing link (1drv.ms)
        if (sharePointUrl.includes('1drv.ms')) {
          // These usually redirect to proper download URLs
          return sharePointUrl + (sharePointUrl.includes('?') ? '&download=1' : '?download=1');
        }

        // Format 3: SharePoint view link - convert to download
        if (sharePointUrl.includes('/_layouts/15/') || sharePointUrl.includes('/_layouts/')) {
          // Try to convert view link to download link
          return sharePointUrl.replace('/_layouts/15/', '/_layouts/15/download.aspx?SourceUrl=');
        }

        // Format 4: Modern SharePoint sharing link
        if (sharePointUrl.includes('/personal/') || sharePointUrl.includes('/sites/')) {
          // Add download parameter
          const url = new URL(sharePointUrl);
          url.searchParams.set('download', '1');
          return url.toString();
        }

        // Format 5: General SharePoint URLs - try adding download parameter
        if (sharePointUrl.includes('sharepoint.com')) {
          const url = new URL(sharePointUrl);
          url.searchParams.set('download', '1');
          return url.toString();
        }
      }

      // If we can't convert, return the original URL and let the download attempt handle it
      return sharePointUrl;

    } catch (error) {
      console.error('❌ Error converting SharePoint URL:', error);
      return sharePointUrl; // Fallback to original URL
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
      const url = new URL(sharePointUrl);
      const pathname = url.pathname;
      
      // Extract filename from path
      const segments = pathname.split('/');
      const filename = segments[segments.length - 1];
      
      if (filename && filename.includes('.')) {
        return decodeURIComponent(filename);
      }
      
      // Fallback to timestamp-based filename
      return `sharepoint_file_${Date.now()}.mp4`;
      
    } catch (error) {
      console.error('❌ Error extracting SharePoint filename:', error);
      return `sharepoint_file_${Date.now()}.mp4`;
    }
  }
}