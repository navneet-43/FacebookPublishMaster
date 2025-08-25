import puppeteer from 'puppeteer';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

interface VideoDownloadResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
  videoInfo?: {
    title?: string;
    duration?: string;
    quality?: string;
  };
}

export class FacebookVideoDownloader {
  private static readonly DOWNLOAD_DIR = path.join(process.cwd(), 'temp', 'fb_videos');
  private static readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Download Facebook video in highest quality available
   */
  static async downloadVideo(facebookUrl: string): Promise<VideoDownloadResult> {
    try {
      console.log('🎥 Starting Facebook video download:', facebookUrl);

      // Validate Facebook URL
      if (!this.isValidFacebookVideoUrl(facebookUrl)) {
        return { success: false, error: 'Invalid Facebook video URL' };
      }

      // Ensure download directory exists
      await this.ensureDownloadDirectory();

      // Try network-based extraction first (more reliable in server environments)
      console.log('🔄 Trying network-based extraction first...');
      let videoInfo: { success: boolean; videoUrl?: string; title?: string; error?: string } = await this.extractVideoUrlFromNetwork(facebookUrl);
      
      if (!videoInfo.success || !videoInfo.videoUrl) {
        console.log('🔄 Network extraction failed, trying mobile version...');
        const mobileUrl = facebookUrl.replace('www.facebook.com', 'm.facebook.com');
        videoInfo = await this.extractVideoUrlFromNetwork(mobileUrl);
      }
      
      if (!videoInfo.success || !videoInfo.videoUrl) {
        console.log('🔄 Network methods failed, trying browser extraction...');
        try {
          const browserResult = await this.extractVideoInfo(facebookUrl);
          if (browserResult.success && browserResult.videoUrl) {
            videoInfo = browserResult;
          }
        } catch (error) {
          console.log('❌ Browser extraction also failed:', error);
          videoInfo = { 
            success: false, 
            error: 'Browser extraction failed: ' + (error instanceof Error ? error.message : 'Unknown error') 
          };
        }
      }
      
      if (!videoInfo.success || !videoInfo.videoUrl) {
        return { success: false, error: videoInfo.error || 'Failed to extract video URL from all methods' };
      }

      // Download the video file
      const downloadResult = await this.downloadVideoFile(videoInfo.videoUrl, videoInfo.title);
      if (!downloadResult.success) {
        return { success: false, error: downloadResult.error };
      }

      console.log('✅ Facebook video downloaded successfully:', downloadResult.filename);
      return {
        success: true,
        filePath: downloadResult.filePath,
        filename: downloadResult.filename,
        videoInfo: {
          title: videoInfo.title,
          duration: 'Unknown',
          quality: 'Original'
        }
      };

    } catch (error) {
      console.error('❌ Error downloading Facebook video:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Extract video information and download URL from Facebook page
   */
  private static async extractVideoInfo(facebookUrl: string): Promise<{
    success: boolean;
    videoUrl?: string;
    title?: string;
    duration?: string;
    quality?: string;
    error?: string;
  }> {
    let browser;
    try {
      console.log('🔍 Extracting video info from Facebook page...');

      // Launch browser with stealth settings and additional Linux flags
      browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--single-process',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent(this.USER_AGENT);
      await page.setViewport({ width: 1920, height: 1080 });

      // Block unnecessary resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['stylesheet', 'font', 'image'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Navigate to Facebook video page
      await page.goto(facebookUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for video element to load
      await page.waitForSelector('video', { timeout: 10000 }).catch(() => null);

      // Extract video information using multiple selectors
      const videoInfo = await page.evaluate(() => {
        // Try multiple methods to find video elements
        const videoSelectors = [
          'video[src]',
          'video source[src]',
          '[data-video-id] video',
          '.spotlight video',
          'div[role="main"] video'
        ];

        let videoElement: HTMLVideoElement | null = null;
        let videoSrc = '';

        // Find video element
        for (const selector of videoSelectors) {
          const element = document.querySelector(selector) as HTMLVideoElement;
          if (element && element.src) {
            videoElement = element;
            videoSrc = element.src;
            break;
          }
        }

        // Try to find source elements
        if (!videoSrc) {
          const sources = Array.from(document.querySelectorAll('video source[src]'));
          for (const source of sources) {
            const src = (source as HTMLSourceElement).src;
            if (src && src.includes('video')) {
              videoSrc = src;
              break;
            }
          }
        }

        // Extract title from page
        const titleSelectors = [
          '[data-pagelet="VideoPlayerTitle"] h1',
          '[role="main"] h1',
          'h1[dir="auto"]',
          '.x1e558r4 h1',
          'title'
        ];

        let title = '';
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            title = element.textContent.trim();
            if (title && !title.includes('Facebook')) {
              break;
            }
          }
        }

        // Get video duration if available
        const duration = videoElement?.duration ? Math.floor(videoElement.duration).toString() + 's' : undefined;

        return {
          videoUrl: videoSrc,
          title: title || 'Facebook Video',
          duration,
          quality: 'HD' // Assume HD for Facebook videos
        };
      });

      await browser.close();

      if (!videoInfo.videoUrl) {
        // This code path should not be reached now since network extraction is done first
        return { success: false, error: 'Could not extract video URL from browser method' };
      }

      console.log('✅ Video info extracted:', { title: videoInfo.title, hasUrl: !!videoInfo.videoUrl });
      return {
        success: true,
        ...videoInfo
      };

    } catch (error) {
      if (browser) await browser.close();
      console.error('❌ Error extracting video info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract video info'
      };
    }
  }

  /**
   * Alternative method to extract video URL from network requests
   */
  private static async extractVideoUrlFromNetwork(facebookUrl: string): Promise<{
    success: boolean;
    videoUrl?: string;
    title?: string;
    error?: string;
  }> {
    try {
      console.log('🔍 Trying alternative extraction method...');

      // Convert to mobile URL for easier parsing
      const mobileUrl = facebookUrl.replace('www.facebook.com', 'm.facebook.com');

      const response = await axios.get(mobileUrl, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        timeout: 15000
      });

      const html = response.data;

      // Extract video URL using regex patterns
      const videoUrlPatterns = [
        /"hd_src":"([^"]+)"/,
        /"sd_src":"([^"]+)"/,
        /"browser_native_hd_url":"([^"]+)"/,
        /"browser_native_sd_url":"([^"]+)"/,
        /"playable_url":"([^"]+)"/,
        /"videoUrl":"([^"]+)"/,
        /hd_src:"([^"]+)"/,
        /sd_src:"([^"]+)"/,
        /"playable_url_quality_hd":"([^"]+)"/,
        /"playable_url_quality_sd":"([^"]+)"/,
        /\\"hd_src\\":\\"([^"]+)\\"/,
        /\\"sd_src\\":\\"([^"]+)\\"/
      ];

      let videoUrl = '';
      for (const pattern of videoUrlPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          if (videoUrl.startsWith('http')) {
            break;
          }
        }
      }

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : 'Facebook Video';

      if (!videoUrl) {
        // Check if this looks like a login or access restriction page
        const isLoginPage = html.includes('login') || html.includes('log in') || html.includes('sign in');
        const isPrivateContent = html.includes('private') || html.includes('not available') || html.includes('access denied');
        const isError = html.includes('error') || html.includes('not found');
        
        let errorMsg = 'Could not find video URL in page source.';
        if (isLoginPage) {
          errorMsg += ' The video may require login to access.';
        } else if (isPrivateContent) {
          errorMsg += ' The video appears to be private or restricted.';
        } else if (isError) {
          errorMsg += ' The video may have been deleted or is unavailable.';
        } else {
          errorMsg += ' Facebook may have changed their page structure or the video URL patterns.';
        }
        
        return {
          success: false,
          error: errorMsg
        };
      }

      console.log('✅ Video URL extracted via network method');
      return {
        success: true,
        videoUrl,
        title
      };

    } catch (error) {
      console.error('❌ Error in network extraction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network extraction failed'
      };
    }
  }

  /**
   * Download video file from extracted URL
   */
  private static async downloadVideoFile(videoUrl: string, title?: string): Promise<{
    success: boolean;
    filePath?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      console.log('⬇️ Downloading video file...');

      const filename = `fb_video_${randomUUID()}_${this.sanitizeFilename(title || 'video')}.mp4`;
      const filePath = path.join(this.DOWNLOAD_DIR, filename);

      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': this.USER_AGENT,
          'Referer': 'https://www.facebook.com/',
          'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5'
        },
        timeout: 120000 // 2 minutes timeout for large videos
      });

      const writer = await fs.open(filePath, 'w');
      const writeStream = writer.createWriteStream();

      response.data.pipe(writeStream);

      return new Promise((resolve) => {
        writeStream.on('finish', async () => {
          await writer.close();
          
          // Validate the downloaded file is actually a video and not HTML
          const { VideoValidator } = await import('./videoValidator');
          const validation = await VideoValidator.validateVideoFile(filePath);
          
          if (!validation.isValid) {
            console.error('❌ Downloaded file is not a valid video:', validation.error);
            console.error('🔍 Detected format:', validation.actualFormat);
            
            // Clean up invalid file
            try {
              await fs.unlink(filePath);
            } catch (e) {
              console.warn('Failed to cleanup invalid file:', e);
            }
            
            resolve({
              success: false,
              error: `Downloaded content is not a video file. Got: ${validation.actualFormat}. This usually means the Facebook video is private or the URL extraction failed.`
            });
            return;
          }
          
          console.log('✅ Video file downloaded and validated successfully');
          resolve({
            success: true,
            filePath,
            filename
          });
        });

        writeStream.on('error', async (error) => {
          await writer.close();
          console.error('❌ Error writing video file:', error);
          resolve({
            success: false,
            error: error.message
          });
        });
      });

    } catch (error) {
      console.error('❌ Error downloading video file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed'
      };
    }
  }

  /**
   * Validate Facebook video URL
   */
  private static isValidFacebookVideoUrl(url: string): boolean {
    const facebookVideoPatterns = [
      /^https?:\/\/(www\.)?facebook\.com\/.*\/videos\/\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/watch\/\?v=\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/.*\/posts\/\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/video\.php\?v=\d+/
    ];

    return facebookVideoPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Ensure download directory exists
   */
  private static async ensureDownloadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.DOWNLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating download directory:', error);
    }
  }

  /**
   * Sanitize filename for safe file system usage
   */
  private static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  /**
   * Clean up downloaded files (optional cleanup method)
   */
  static async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log('🗑️ Cleaned up temporary file:', filePath);
    } catch (error) {
      console.error('Error cleaning up file:', error);
    }
  }
}