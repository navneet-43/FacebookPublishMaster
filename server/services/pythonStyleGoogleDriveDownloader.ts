import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

export class PythonStyleGoogleDriveDownloader {
  /**
   * Convert Google Drive share URL to file ID
   */
  private static convertDriveLinkToFileId(url: string): string {
    // Extract file ID from various Google Drive URL formats
    const match = url.match(/\/d\/([\w-]+)/);
    if (match) {
      return match[1];
    }
    
    if (url.includes('open?id=')) {
      return url.split('open?id=')[1];
    }
    
    return url;
  }

  /**
   * Get confirmation token from HTML form (BeautifulSoup equivalent)
   */
  private static getConfirmInfoFromForm(html: string): { token: string | null, uuid: string | null } {
    const $ = cheerio.load(html);
    const form = $('#download-form');
    
    if (form.length === 0) {
      return { token: null, uuid: null };
    }
    
    const confirmInput = form.find('input[name="confirm"]');
    const uuidInput = form.find('input[name="uuid"]');
    
    const token = confirmInput.length > 0 ? confirmInput.attr('value') || null : null;
    const uuid = uuidInput.length > 0 ? uuidInput.attr('value') || null : null;
    
    return { token, uuid };
  }

  /**
   * Download video file with confirmation token handling - exact Python implementation
   */
  static async downloadVideoFile(url: string): Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }> {
    try {
      const fileId = this.convertDriveLinkToFileId(url);
      console.log(`Starting Python-style Google Drive download for file ID: ${fileId}`);
      
      // Create session equivalent (using cookies jar)
      const cookieJar: { [key: string]: string } = {};
      
      // Step 1: Initial request to get confirmation token
      const baseUrl = 'https://drive.google.com/uc?export=download';
      const initialResponse = await fetch(`${baseUrl}&id=${fileId}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // Extract cookies from response
      const setCookieHeaders = initialResponse.headers.raw()['set-cookie'];
      if (setCookieHeaders) {
        setCookieHeaders.forEach(cookie => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          if (name && value) {
            cookieJar[name.trim()] = value.trim();
          }
        });
      }
      
      const initialHtml = await initialResponse.text();
      const { token, uuid } = this.getConfirmInfoFromForm(initialHtml);
      
      let finalResponse = initialResponse;
      
      // Step 2: If confirmation token found, make second request
      if (token && uuid) {
        console.log(`Confirmation token found: ${token}, UUID: ${uuid}`);
        const confirmUrl = 'https://drive.usercontent.google.com/download';
        
        // Build cookie string
        const cookieString = Object.entries(cookieJar)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
        
        const params = new URLSearchParams({
          'id': fileId,
          'export': 'download',
          'confirm': token,
          'uuid': uuid
        });
        
        finalResponse = await fetch(`${confirmUrl}?${params.toString()}`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Cookie': cookieString
          }
        });
      }
      
      // Step 3: Validate response
      const contentType = finalResponse.headers.get('content-type') || '';
      const contentLength = parseInt(finalResponse.headers.get('content-length') || '0');
      
      console.log(`Response content-type: ${contentType}, content-length: ${contentLength}`);
      
      // Check for HTML response (error) or small file size
      if (contentType.toLowerCase().includes('html') || contentLength < 1000000) {
        const errorHtml = await finalResponse.text();
        console.error('Received HTML response or small file size:', errorHtml.substring(0, 500));
        return {
          success: false,
          error: 'Received invalid content type or file too small. File may not be publicly accessible.'
        };
      }
      
      // Step 4: Download the file
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const fileName = `gdrive_video_${Date.now()}.mp4`;
      const filePath = path.join(tempDir, fileName);
      
      const fileStream = fs.createWriteStream(filePath);
      let downloaded = 0;
      
      return new Promise((resolve) => {
        if (!finalResponse.body) {
          resolve({
            success: false,
            error: 'No response body available'
          });
          return;
        }
        
        finalResponse.body.on('data', (chunk: Buffer) => {
          fileStream.write(chunk);
          downloaded += chunk.length;
          
          if (contentLength > 0) {
            const progress = Math.min(100, Math.floor(downloaded * 100 / contentLength));
            if (progress % 10 === 0) { // Log every 10%
              console.log(`Download progress: ${progress}%`);
            }
          }
        });
        
        finalResponse.body.on('end', () => {
          fileStream.end();
          console.log(`✅ Python-style download complete: ${downloaded} bytes`);
          
          resolve({
            success: true,
            filePath,
            fileSize: downloaded
          });
        });
        
        finalResponse.body.on('error', (error) => {
          fileStream.destroy();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          
          resolve({
            success: false,
            error: `Download stream error: ${error.message}`
          });
        });
      });
      
    } catch (error) {
      console.error('Python-style Google Drive download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error'
      };
    }
  }
  
  /**
   * Clean up downloaded file
   */
  static cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up downloaded file: ${filePath}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup file ${filePath}:`, error);
    }
  }
}