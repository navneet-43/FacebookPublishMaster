/**
 * Comprehensive Google Drive video access helper
 * Handles various sharing permission scenarios and URL formats
 */
export class GoogleDriveHelper {
  
  /**
   * Extract file ID from any Google Drive URL format
   */
  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/open\?id=([a-zA-Z0-9_-]+)/,
      /\/uc\?id=([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Generate multiple Google Drive access URLs for testing
   */
  static generateAccessUrls(fileId: string): string[] {
    return [
      // Direct download formats
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/u/0/uc?id=${fileId}&export=download`,
      `https://docs.google.com/uc?export=download&id=${fileId}`,
      
      // Streaming formats that might work with Facebook
      `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
      `https://drive.google.com/open?id=${fileId}`,
      
      // Alternative formats
      `https://drive.google.com/uc?id=${fileId}&authuser=0&export=download`,
      `https://drive.google.com/u/0/uc?export=download&confirm=t&id=${fileId}`
    ];
  }

  /**
   * Test URL and determine if it returns valid video data
   */
  static async testVideoUrl(url: string, timeout = 10000): Promise<{
    success: boolean;
    size: number;
    contentType: string | null;
    isVideo: boolean;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'video/*, application/octet-stream, */*'
        }
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength, 10) : 0;
      
      // Determine if this looks like video data
      const isVideo = Boolean(
        contentType?.includes('video') ||
        contentType?.includes('application/octet-stream') ||
        (size > 100000 && !contentType?.includes('text/html'))
      );
      
      return {
        success: response.ok,
        size,
        contentType,
        isVideo,
      };
      
    } catch (error) {
      return {
        success: false,
        size: 0,
        contentType: null,
        isVideo: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Find the best working Google Drive URL for video access
   */
  static async findWorkingVideoUrl(originalUrl: string): Promise<{
    workingUrl: string | null;
    size: number;
    contentType: string | null;
    testedUrls: { url: string; result: any }[];
  }> {
    console.log('🔍 FINDING WORKING GOOGLE DRIVE URL for:', originalUrl);
    
    const fileId = this.extractFileId(originalUrl);
    if (!fileId) {
      console.log('❌ Could not extract file ID');
      return {
        workingUrl: null,
        size: 0,
        contentType: null,
        testedUrls: []
      };
    }
    
    console.log('✅ Extracted file ID:', fileId);
    
    const testUrls = this.generateAccessUrls(fileId);
    const testedUrls = [];
    
    for (const testUrl of testUrls) {
      console.log('🧪 Testing:', testUrl.split('?')[0] + '?...');
      
      const result = await this.testVideoUrl(testUrl);
      testedUrls.push({ url: testUrl, result });
      
      console.log(`   Result: ${result.success ? '✅' : '❌'} ${(result.size / 1024 / 1024).toFixed(2)}MB ${result.contentType || 'unknown'} ${result.isVideo ? '(VIDEO)' : '(NOT VIDEO)'}`);
      
      // Found a working video URL
      if (result.success && result.isVideo && result.size > 1000) {
        console.log('🎯 FOUND WORKING VIDEO URL:', testUrl);
        return {
          workingUrl: testUrl,
          size: result.size,
          contentType: result.contentType,
          testedUrls
        };
      }
    }
    
    console.log('❌ No working video URL found');
    return {
      workingUrl: null,
      size: 0,
      contentType: null,
      testedUrls
    };
  }

  /**
   * Generate detailed error message with Google Drive troubleshooting steps
   */
  static generateErrorMessage(fileId: string, testedUrls: { url: string; result: any }[]): string {
    let message = `Google Drive video access failed for file ID: ${fileId}\n\n`;
    
    message += `🔧 TROUBLESHOOTING STEPS:\n`;
    message += `1. Right-click the video in Google Drive\n`;
    message += `2. Select "Get link" or "Share"\n`;
    message += `3. Change access to "Anyone with the link can view"\n`;
    message += `4. Make sure the file is fully uploaded (not still processing)\n`;
    message += `5. Try downloading the file manually to test access\n\n`;
    
    message += `🔍 TESTED URL FORMATS:\n`;
    testedUrls.forEach(({ url, result }, i) => {
      const status = result.success ? '✅' : '❌';
      const size = (result.size / 1024 / 1024).toFixed(2);
      message += `${i + 1}. ${status} ${size}MB - ${result.contentType || 'unknown'}\n`;
    });
    
    message += `\n💡 ALTERNATIVE SOLUTIONS:\n`;
    message += `• Upload video directly to Facebook instead of using Google Drive\n`;
    message += `• Use YouTube or Vimeo for hosting large videos\n`;
    message += `• Compress the video using HandBrake before uploading\n`;
    message += `• Share the Google Drive folder with wider permissions\n`;
    
    return message;
  }
}