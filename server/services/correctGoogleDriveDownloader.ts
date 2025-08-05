import fs from 'fs';

interface GoogleDriveDownloadOptions {
  googleDriveUrl: string;
  outputPath?: string;
}

interface GoogleDriveDownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export class CorrectGoogleDriveDownloader {
  
  private extractFileId(url: string): string {
    // Handle multiple Google Drive URL formats
    console.log(`🔍 Extracting file ID from URL: ${url}`);
    
    // Format 1: /file/d/FILE_ID/view or /file/d/FILE_ID/edit
    let match = url.match(/\/file\/d\/([\w-]+)/);
    if (match) {
      console.log(`✅ Extracted file ID: ${match[1]} (from /file/d/ format)`);
      return match[1];
    }
    
    // Format 2: /d/FILE_ID
    match = url.match(/\/d\/([\w-]+)/);
    if (match) {
      console.log(`✅ Extracted file ID: ${match[1]} (from /d/ format)`);
      return match[1];
    }
    
    // Format 3: ?id=FILE_ID or open?id=FILE_ID
    match = url.match(/[?&]id=([\w-]+)/);
    if (match) {
      console.log(`✅ Extracted file ID: ${match[1]} (from ?id= format)`);
      return match[1];
    }
    
    // Format 4: Already a file ID (fallback)
    if (url.match(/^[\w-]+$/)) {
      console.log(`✅ URL appears to be file ID: ${url}`);
      return url;
    }
    
    console.log(`⚠️ Could not extract file ID from URL, using as-is: ${url}`);
    return url;
  }

  private async getConfirmationInfoFromForm(html: string): Promise<{ confirm: string | null; uuid: string | null }> {
    // Parse HTML to find download form (matching Python BeautifulSoup approach)
    const formMatch = html.match(/<form[^>]*id="download-form"[^>]*>([\s\S]*?)<\/form>/);
    
    if (!formMatch) {
      return { confirm: null, uuid: null };
    }
    
    const formContent = formMatch[1];
    
    // Extract confirm and uuid values from input elements
    const confirmMatch = formContent.match(/<input[^>]*name="confirm"[^>]*value="([^"]+)"/);
    const uuidMatch = formContent.match(/<input[^>]*name="uuid"[^>]*value="([^"]+)"/);
    
    return {
      confirm: confirmMatch ? confirmMatch[1] : null,
      uuid: uuidMatch ? uuidMatch[1] : null
    };
  }

  private async handleVirusScanWarning(html: string, fileId: string, headers: any): Promise<string> {
    // Check if this is a virus scan warning page
    if (html.includes('virus scan') || html.includes('Google Drive can\'t scan') || html.includes('Download anyway')) {
      console.log('🦠 Virus scan warning detected - bypassing...');
      
      // Extract the bypass URL from the "Download anyway" link
      const downloadAnywayMatch = html.match(/href="([^"]*download[^"]*confirm=t[^"]*)"/);
      if (downloadAnywayMatch) {
        const bypassUrl = downloadAnywayMatch[1].replace(/&amp;/g, '&');
        console.log('🔓 Found virus scan bypass URL');
        return bypassUrl;
      }
      
      // Alternative method: construct bypass URL manually
      const confirmMatch = html.match(/confirm=([^&"]+)/);
      if (confirmMatch) {
        const confirmToken = confirmMatch[1];
        const bypassUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmToken}`;
        console.log('🔧 Constructed virus scan bypass URL');
        return bypassUrl;
      }
      
      // Fallback: try direct download with confirm=t parameter
      console.log('⚡ Using fallback virus scan bypass method');
      return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    }
    
    return '';
  }

  async downloadVideoFile(options: GoogleDriveDownloadOptions): Promise<GoogleDriveDownloadResult> {
    const fileId = this.extractFileId(options.googleDriveUrl);
    const outputPath = options.outputPath || `/tmp/google_drive_${Date.now()}.mp4`;
    
    console.log(`Starting Google Drive download for file: ${fileId}`);
    
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Enhanced headers to better mimic browser requests
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      };
      
      // Try multiple download methods in order of preference
      const downloadMethods = [
        // Method 1: Direct download with usercontent domain
        () => this.tryDirectDownload(fetch, fileId, headers, outputPath),
        // Method 2: Traditional uc export method
        () => this.tryUcExportDownload(fetch, fileId, headers, outputPath),
        // Method 3: Alternative sharing URL method
        () => this.trySharingUrlDownload(fetch, fileId, headers, outputPath)
      ];
      
      let lastError = '';
      for (let i = 0; i < downloadMethods.length; i++) {
        console.log(`🔄 Trying download method ${i + 1}/${downloadMethods.length}`);
        try {
          const result = await downloadMethods[i]();
          if (result.success) {
            console.log(`✅ Download method ${i + 1} succeeded`);
            return result;
          }
          lastError = result.error || 'Unknown error';
          console.log(`❌ Download method ${i + 1} failed: ${lastError}`);
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
          console.log(`❌ Download method ${i + 1} failed: ${lastError}`);
        }
      }
      
      throw new Error(`All download methods failed. Last error: ${lastError}`);
      
    } catch (error) {
      console.error('Google Drive download error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async tryDirectDownload(fetch: any, fileId: string, headers: any, outputPath: string): Promise<GoogleDriveDownloadResult> {
    console.log('📁 Trying direct usercontent download...');
    
    const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const response = await fetch(directUrl, { headers, redirect: 'follow' });
    
    return this.processDownloadResponse(response, outputPath, 'Direct download');
  }

  private async tryUcExportDownload(fetch: any, fileId: string, headers: any, outputPath: string): Promise<GoogleDriveDownloadResult> {
    console.log('📄 Trying traditional UC export download...');
    
    // Step 1: Initial request to get download page
    const baseUrl = "https://drive.google.com/uc?export=download";
    const response = await fetch(`${baseUrl}&id=${fileId}`, { 
      headers,
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`Initial request failed: ${response.status}`);
    }
    
    const html = await response.text();
      
    // Check if we got HTML content (sign-in or permission page)
    if (html.includes('<html') && (html.includes('sign in') || html.includes('Sign in') || html.includes('permission') || html.includes('access'))) {
      throw new Error('File requires authentication or permission - got HTML sign-in page');
    }
    
    // Step 2: Check for virus scan warning and handle bypass
    const virusBypassUrl = await this.handleVirusScanWarning(html, fileId, headers);
    let downloadResponse;
    
    if (virusBypassUrl) {
      console.log('🦠 Using virus scan bypass URL');
      downloadResponse = await fetch(virusBypassUrl, {
        headers,
        redirect: 'follow'
      });
    } else {
      // Step 3: Extract confirmation info from form
      const { confirm, uuid } = await this.getConfirmationInfoFromForm(html);
      
      if (!confirm || !uuid) {
        throw new Error('No confirmation tokens found in HTML response');
      }
      
      console.log(`Confirmation token extracted: ${confirm.substring(0, 10)}...`);
      
      // Step 4: Download with confirmation token
      const confirmUrl = "https://drive.usercontent.google.com/download";
      const params = new URLSearchParams({
        id: fileId,
        export: 'download',
        confirm: confirm,
        uuid: uuid
      });
      
      downloadResponse = await fetch(`${confirmUrl}?${params}`, {
        headers,
        redirect: 'follow'
      });
    }
    
    return this.processDownloadResponse(downloadResponse, outputPath, 'UC export');
  }

  private async trySharingUrlDownload(fetch: any, fileId: string, headers: any, outputPath: string): Promise<GoogleDriveDownloadResult> {
    console.log('🔗 Trying sharing URL download...');
    
    // Try alternative URL formats that sometimes work for shared files
    const alternativeUrls = [
      `https://drive.google.com/uc?id=${fileId}&export=download&confirm=no_antivirus`,
      `https://docs.google.com/uc?id=${fileId}&export=download`,
      `https://drive.google.com/file/d/${fileId}/view?usp=sharing&export=download`
    ];
    
    for (const url of alternativeUrls) {
      try {
        console.log(`🔄 Trying URL: ${url.substring(0, 60)}...`);
        const response = await fetch(url, { headers, redirect: 'follow' });
        const result = await this.processDownloadResponse(response, outputPath, 'Sharing URL');
        if (result.success) {
          return result;
        }
      } catch (error) {
        console.log(`❌ URL failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    throw new Error('All sharing URL methods failed');
  }

  private async processDownloadResponse(response: any, outputPath: string, method: string): Promise<GoogleDriveDownloadResult> {
    if (!response.ok) {
      throw new Error(`${method} request failed: ${response.status}`);
    }
    
    // Validate content type and size
    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    
    console.log(`📊 Content-Type: ${contentType}, Content-Length: ${contentLength}`);
    
    // Check if we got HTML content instead of binary data
    if (contentType.toLowerCase().includes('html')) {
      const htmlContent = await response.text();
      
      // Save error HTML for debugging
      fs.writeFileSync('/tmp/error_debug.html', htmlContent, 'utf-8');
      
      // Check for specific error patterns
      if (htmlContent.includes('sign in') || htmlContent.includes('Sign in')) {
        throw new Error('File requires Google account sign-in');
      }
      if (htmlContent.includes('permission') || htmlContent.includes('access denied')) {
        throw new Error('File access denied - insufficient permissions');
      }
      if (htmlContent.includes('quota') || htmlContent.includes('limit')) {
        throw new Error('Download quota exceeded');
      }
      
      throw new Error(`Received HTML content instead of file data (${method})`);
    }
    
    // Check minimum file size (videos should be larger than 1MB)
    if (contentLength > 0 && contentLength < 1000000) {
      throw new Error(`File too small (${contentLength} bytes) - likely not a video file`);
    }
    
    console.log(`✅ Valid content detected - downloading ${(contentLength / (1024 * 1024)).toFixed(1)}MB file...`);
    
    // Stream download
    return await this.robustStreamDownload(response, outputPath, contentLength);
  }

  private async robustStreamDownload(response: any, outputPath: string, expectedSize: number): Promise<GoogleDriveDownloadResult> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 32768 }); // 32KB buffer like Python
      let downloadedBytes = 0;
      let lastReportedProgress = -1;
      let stagnationTimer: NodeJS.Timeout | null = null;
      let lastProgressTime = Date.now();
      
      // Set up stagnation detection
      const checkStagnation = () => {
        const now = Date.now();
        if (now - lastProgressTime > 30000) { // No progress for 30 seconds
          reject(new Error('Download stagnated - no progress for 30 seconds'));
          return;
        }
        stagnationTimer = setTimeout(checkStagnation, 10000);
      };
      stagnationTimer = setTimeout(checkStagnation, 10000);
      
      response.body.on('data', (chunk: Buffer) => {
        writeStream.write(chunk);
        
        downloadedBytes += chunk.length;
        lastProgressTime = Date.now();
        
        // Progress reporting (matching Python script style)
        if (expectedSize > 0) {
          const progress = Math.min(100, Math.floor((downloadedBytes * 100) / expectedSize));
          if (progress !== lastReportedProgress && progress % 5 === 0) {  // Report every 5%
            console.log(`Download progress: ${progress}%`);
            lastReportedProgress = progress;
          }
        }
      });
      
      response.body.on('end', () => {
        if (stagnationTimer) clearTimeout(stagnationTimer);
        
        writeStream.end((error: any) => {
          if (error) {
            reject(error);
            return;
          }
          
          if (!fs.existsSync(outputPath)) {
            reject(new Error('Download completed but file not found'));
            return;
          }
          
          const finalSize = fs.statSync(outputPath).size;
          const finalSizeMB = finalSize / (1024 * 1024);
          
          console.log(`✅ Download complete: ${finalSizeMB.toFixed(3)}MB`);
          
          // Enhanced size validation
          if (expectedSize > 0) {
            const sizeDifference = Math.abs(finalSize - expectedSize);
            const sizeDifferencePercent = (sizeDifference / expectedSize) * 100;
            
            console.log(`Expected: ${(expectedSize / (1024 * 1024)).toFixed(3)}MB`);
            console.log(`Downloaded: ${finalSizeMB.toFixed(3)}MB`);
            console.log(`Difference: ${(sizeDifference / (1024 * 1024)).toFixed(3)}MB (${sizeDifferencePercent.toFixed(4)}%)`);
            
            if (sizeDifferencePercent > 0.001) { // More than 0.001% difference
              console.warn(`⚠️  Size mismatch detected: ${sizeDifferencePercent.toFixed(4)}% difference`);
              
              if (sizeDifferencePercent > 0.1) { // More than 0.1% is significant
                reject(new Error(`Significant size mismatch: Expected ${(expectedSize / (1024 * 1024)).toFixed(3)}MB, got ${finalSizeMB.toFixed(3)}MB`));
                return;
              }
            }
          }
          
          resolve({
            success: true,
            filePath: outputPath,
            fileSize: finalSize
          });
        });
      });
      
      response.body.on('error', (error: Error) => {
        if (stagnationTimer) clearTimeout(stagnationTimer);
        writeStream.destroy();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(error);
      });
      
      writeStream.on('error', (error: Error) => {
        if (stagnationTimer) clearTimeout(stagnationTimer);
        reject(error);
      });
    });
  }
}