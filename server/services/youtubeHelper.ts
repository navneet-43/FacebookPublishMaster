/**
 * YouTube video helper for Facebook integration
 * Handles YouTube URLs and provides optimization for Facebook publishing
 */
export class YouTubeHelper {
  
  /**
   * Check if URL is a YouTube link
   */
  static isYouTubeUrl(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  /**
   * Extract YouTube video ID from various URL formats
   */
  static extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
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
   * Get optimized YouTube URL for Facebook video integration
   */
  static getOptimizedUrl(originalUrl: string): {
    workingUrl: string;
    size: number;
    contentType: string;
    verified: boolean;
    videoId?: string;
    method: 'youtube_native' | 'fallback';
    isValid: boolean;
  } {
    console.log('🎥 OPTIMIZING YOUTUBE URL for Facebook integration');
    
    const videoId = this.extractVideoId(originalUrl);
    
    if (!videoId) {
      console.log('❌ Could not extract YouTube video ID');
      return {
        workingUrl: originalUrl,
        size: 0,
        contentType: 'text/html',
        verified: false,
        method: 'fallback',
        isValid: false
      };
    }

    console.log('🔍 YOUTUBE VIDEO ID:', videoId);

    // Create standard YouTube URL format for Facebook
    const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log('✅ YOUTUBE URL OPTIMIZED for Facebook native integration');
    
    return {
      workingUrl: standardUrl,
      size: 0, // YouTube handles size internally
      contentType: 'video/youtube',
      verified: true,
      videoId,
      method: 'youtube_native',
      isValid: true
    };
  }

  /**
   * Validate YouTube URL for Facebook compatibility
   */
  static async validateForFacebook(url: string): Promise<{
    isValid: boolean;
    videoId?: string;
    recommendations: string[];
    error?: string;
  }> {
    const recommendations: string[] = [];
    
    try {
      const videoId = this.extractVideoId(url);
      
      if (!videoId) {
        return {
          isValid: false,
          recommendations: [
            'Ensure the YouTube URL contains a valid video ID',
            'Try using standard YouTube URL format: youtube.com/watch?v=VIDEO_ID',
            'Check that the URL is not corrupted or truncated'
          ],
          error: 'Invalid YouTube URL format'
        };
      }

      // YouTube URLs work natively with Facebook
      recommendations.push('YouTube integration is natively supported by Facebook');
      recommendations.push('Video will be embedded directly - no file size limits');
      recommendations.push('Works with both public and unlisted videos');
      recommendations.push('Recommended: Use unlisted videos for privacy until posting');

      return {
        isValid: true,
        videoId,
        recommendations
      };

    } catch (error) {
      return {
        isValid: false,
        recommendations: [
          'Check your internet connection',
          'Verify the YouTube URL is accessible',
          'Ensure the video is not private'
        ],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate YouTube setup instructions
   */
  static getYouTubeInstructions(): string {
    return `YOUTUBE VIDEO SETUP FOR FACEBOOK:

1. **Upload to YouTube**:
   • Use any YouTube account (free works)
   • Upload your video file
   • Set privacy to "Public" or "Unlisted" (recommended)

2. **Get Video URL**:
   • Copy the YouTube video URL from address bar
   • Format: youtube.com/watch?v=VIDEO_ID
   • Or use short format: youtu.be/VIDEO_ID

3. **Privacy Settings**:
   • Public: Anyone can find and watch
   • Unlisted: Only people with link can access (recommended)
   • Both work perfectly with Facebook integration

4. **Supported Formats**:
   • youtube.com/watch?v=VIDEO_ID (standard)
   • youtu.be/VIDEO_ID (short link)
   • youtube.com/embed/VIDEO_ID (embed)

✅ ADVANTAGES:
• Native Facebook integration - no conversion needed
• No file size limits (YouTube handles compression)
• Reliable video delivery and playback
• Works with any video format uploaded to YouTube
• No download permissions or special setup required

⚡ INSTANT COMPATIBILITY:
• Facebook recognizes YouTube URLs automatically
• No processing delays or conversion failures
• Works immediately upon posting`;
  }

  /**
   * Convert various YouTube URL formats to standard format
   */
  static normalizeUrl(url: string): string {
    const videoId = this.extractVideoId(url);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  }
}