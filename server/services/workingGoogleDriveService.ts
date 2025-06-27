import fetch from 'node-fetch';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class WorkingGoogleDriveService {
  
  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /folders\/([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  static async downloadLargeFile(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('🎯 WORKING GOOGLE DRIVE SERVICE');
    console.log('📁 URL:', url);
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/gdrive_${fileId}_${Date.now()}.mp4`;
    console.log('📥 Target file:', outputFile);

    // Method 1: Direct download with proper headers
    console.log('🔄 Method 1: Direct download with session bypass');
    try {
      const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const response = await fetch(directUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow'
      });

      if (response.ok && response.body) {
        const writer = fs.createWriteStream(outputFile);
        
        await new Promise((resolve, reject) => {
          response.body!.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 5) { // At least 5MB for a real video
            console.log(`✅ Method 1 success: ${sizeMB.toFixed(1)}MB downloaded`);
            return { success: true, filePath: outputFile, sizeMB: sizeMB };
          } else {
            console.log(`❌ Method 1 failed: Only ${sizeMB.toFixed(1)}MB downloaded`);
            fs.unlinkSync(outputFile);
          }
        }
      }
    } catch (error) {
      console.log('❌ Method 1 failed:', (error as Error).message);
    }

    // Method 2: Use gdown if available
    console.log('🔄 Method 2: Using gdown Python package');
    try {
      const gdownResult = await this.useGdown(fileId, outputFile);
      if (gdownResult.success) {
        return gdownResult;
      }
    } catch (error) {
      console.log('❌ Method 2 failed:', (error as Error).message);
    }

    // Method 3: Use yt-dlp with Google Drive support
    console.log('🔄 Method 3: Using yt-dlp with Google Drive');
    try {
      const ytdlResult = await this.useYtDlp(url, outputFile);
      if (ytdlResult.success) {
        return ytdlResult;
      }
    } catch (error) {
      console.log('❌ Method 3 failed:', (error as Error).message);
    }

    // Method 4: Browser automation approach
    console.log('🔄 Method 4: Browser-style download');
    try {
      const browserResult = await this.browserStyleDownload(fileId, outputFile);
      if (browserResult.success) {
        return browserResult;
      }
    } catch (error) {
      console.log('❌ Method 4 failed:', (error as Error).message);
    }

    return { 
      success: false, 
      error: 'All download methods failed - Google Drive file access restricted' 
    };
  }

  static async useGdown(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const gdown = spawn('gdown', [
        `https://drive.google.com/uc?id=${fileId}`,
        '-O', outputFile,
        '--fuzzy'
      ]);

      let hasOutput = false;

      gdown.stdout.on('data', (data) => {
        hasOutput = true;
        console.log('gdown:', data.toString().trim());
      });

      gdown.stderr.on('data', (data) => {
        console.log('gdown progress:', data.toString().trim());
      });

      gdown.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 5) {
            console.log(`✅ gdown success: ${sizeMB.toFixed(1)}MB`);
            resolve({ success: true, filePath: outputFile, sizeMB: sizeMB });
          } else {
            fs.unlinkSync(outputFile);
            resolve({ success: false, error: `File too small: ${sizeMB.toFixed(1)}MB` });
          }
        } else {
          resolve({ success: false, error: `gdown failed with code ${code}` });
        }
      });

      gdown.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        gdown.kill();
        resolve({ success: false, error: 'gdown timeout' });
      }, 300000);
    });
  }

  static async useYtDlp(url: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const ytdlp = spawn('yt-dlp', [
        url,
        '-o', outputFile,
        '--no-warnings',
        '--force-overwrites'
      ]);

      ytdlp.stdout.on('data', (data) => {
        console.log('yt-dlp:', data.toString().trim());
      });

      ytdlp.stderr.on('data', (data) => {
        console.log('yt-dlp progress:', data.toString().trim());
      });

      ytdlp.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 5) {
            console.log(`✅ yt-dlp success: ${sizeMB.toFixed(1)}MB`);
            resolve({ success: true, filePath: outputFile, sizeMB: sizeMB });
          } else {
            fs.unlinkSync(outputFile);
            resolve({ success: false, error: `File too small: ${sizeMB.toFixed(1)}MB` });
          }
        } else {
          resolve({ success: false, error: `yt-dlp failed with code ${code}` });
        }
      });

      ytdlp.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        ytdlp.kill();
        resolve({ success: false, error: 'yt-dlp timeout' });
      }, 300000);
    });
  }

  static async browserStyleDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    try {
      // Multiple URL patterns to try
      const urls = [
        `https://drive.usercontent.google.com/u/0/uc?id=${fileId}&export=download`,
        `https://drive.google.com/uc?export=download&id=${fileId}`,
        `https://docs.google.com/uc?export=download&id=${fileId}`,
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t&uuid=12345`,
        `https://drive.google.com/u/0/uc?id=${fileId}&export=download&confirm=t`
      ];

      for (const testUrl of urls) {
        console.log(`Testing URL: ${testUrl.substring(0, 60)}...`);
        
        try {
          const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Cache-Control': 'max-age=0'
            },
            redirect: 'follow'
          });

          if (response.ok && response.body) {
            const writer = fs.createWriteStream(outputFile);
            
            await new Promise((resolve, reject) => {
              response.body!.pipe(writer);
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            if (fs.existsSync(outputFile)) {
              const stats = fs.statSync(outputFile);
              const sizeMB = stats.size / (1024 * 1024);
              
              console.log(`Downloaded ${sizeMB.toFixed(1)}MB from ${testUrl.substring(25, 45)}...`);
              
              if (sizeMB > 5) {
                console.log(`✅ Browser method success: ${sizeMB.toFixed(1)}MB`);
                return { success: true, filePath: outputFile, sizeMB: sizeMB };
              } else {
                // Try next URL
                fs.unlinkSync(outputFile);
                continue;
              }
            }
          }
        } catch (urlError) {
          console.log(`URL failed: ${(urlError as Error).message}`);
          continue;
        }
      }

      return { success: false, error: 'All browser-style URLs failed' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}