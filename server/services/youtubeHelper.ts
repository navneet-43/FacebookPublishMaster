import ytdl from '@distube/ytdl-core';
import { createWriteStream, createReadStream, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * YouTube video helper for Facebook integration
 * Downloads YouTube videos and uploads them as actual video files
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
   * Download YouTube video and get file path for Facebook upload
   */
  static async downloadVideo(originalUrl: string): Promise<{
    filePath: string;
    size: number;
    contentType: string;
    verified: boolean;
    videoId?: string;
    method: 'youtube_download';
    isValid: boolean;
    cleanup: () => void;
    error?: string;
  }> {
    console.log('🎥 DOWNLOADING YOUTUBE VIDEO for Facebook upload');
    
    const videoId = this.extractVideoId(originalUrl);
    
    if (!videoId) {
      console.log('❌ Could not extract YouTube video ID');
      return {
        filePath: '',
        size: 0,
        contentType: 'video/mp4',
        verified: false,
        method: 'youtube_download',
        isValid: false,
        cleanup: () => {}
      };
    }

    try {
      // Get video info first with improved error handling
      console.log('🔍 Fetching YouTube video info...');
      const info = await ytdl.getInfo(originalUrl);
      console.log('🔍 YOUTUBE VIDEO INFO:', info.videoDetails.title);
      
      // Find best available format with fallback options
      let format;
      
      // Try MP4 with video and audio first
      let formats = info.formats.filter(format => 
        format.hasVideo && format.hasAudio && format.container === 'mp4'
      );
      
      if (formats.length === 0) {
        // Fallback: try any format with video and audio
        formats = info.formats.filter(format => 
          format.hasVideo && format.hasAudio
        );
      }
      
      if (formats.length === 0) {
        throw new Error('No video formats with both video and audio available');
      }
      
      // Choose highest quality from available formats
      format = formats.reduce((best, current) => {
        const bestHeight = parseInt(String(best.height || '0'));
        const currentHeight = parseInt(String(current.height || '0'));
        return currentHeight > bestHeight ? current : best;
      });
      
      console.log('📹 SELECTED FORMAT:', {
        quality: format.qualityLabel || 'unknown',
        container: format.container || 'unknown',
        hasVideo: format.hasVideo,
        hasAudio: format.hasAudio
      });
      
      // Create temporary file path
      const tempFilePath = join(tmpdir(), `youtube_${videoId}_${Date.now()}.mp4`);
      
      // Download video with robust error handling
      await new Promise<void>((resolve, reject) => {
        const downloadOptions: any = { 
          format: format,
          begin: 0,
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            maxRedirects: 5,
            timeout: 30000
          }
        };
        
        let stream;
        let writeStream;
        let downloadStarted = false;
        let totalSize = 0;
        
        try {
          stream = ytdl(originalUrl, downloadOptions);
          writeStream = createWriteStream(tempFilePath);
          
          stream.pipe(writeStream);
          
          stream.on('info', (videoInfo, videoFormat) => {
            console.log('📡 Download stream initialized');
            totalSize = parseInt(videoFormat.contentLength || '0');
            if (totalSize > 0) {
              console.log(`📊 Video size: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
            }
          });
          
          stream.on('progress', (chunkLength, downloaded, total) => {
            downloadStarted = true;
            const percent = total > 0 ? (downloaded / total * 100).toFixed(1) : '0';
            console.log(`📥 DOWNLOAD PROGRESS: ${percent}% - ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
          });
          
          stream.on('response', () => {
            console.log('📡 Download response received');
          });
          
          writeStream.on('finish', () => {
            console.log('✅ YOUTUBE VIDEO DOWNLOADED:', tempFilePath);
            resolve();
          });
          
          stream.on('error', (error) => {
            console.error('❌ Download stream error:', error.message);
            
            // Clean up streams
            if (writeStream && !writeStream.destroyed) {
              writeStream.destroy();
            }
            
            // Provide specific error handling for "Could not extract functions"
            if (error.message.includes('Could not extract functions')) {
              reject(new Error('YouTube video extraction failed - this video may have restricted access or requires different download methods. Please try a different video or use a direct video hosting service like Dropbox or Vimeo.'));
            } else {
              reject(new Error(`YouTube download failed: ${error.message}`));
            }
          });
          
          writeStream.on('error', (error) => {
            console.error('❌ Write stream error:', error.message);
            if (stream && !stream.destroyed) {
              stream.destroy();
            }
            reject(new Error(`File write failed: ${error.message}`));
          });
          
          // Extended timeout for larger videos
          setTimeout(() => {
            if (!downloadStarted) {
              console.log('⏱️ Download timeout - cleaning up streams');
              if (stream && !stream.destroyed) {
                stream.destroy();
              }
              if (writeStream && !writeStream.destroyed) {
                writeStream.destroy();
              }
              reject(new Error('Download timeout - video may be restricted, too large, or server is busy. Try a shorter video or different hosting service.'));
            }
          }, 60000); // Increased to 60 seconds
          
        } catch (initError) {
          console.error('❌ Stream initialization error:', initError);
          reject(new Error(`Failed to initialize download: ${initError.message}`));
        }
      });
      
      // Get file size
      const stats = statSync(tempFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`📊 DOWNLOADED FILE SIZE: ${fileSizeMB.toFixed(2)}MB`);
      
      return {
        filePath: tempFilePath,
        size: stats.size,
        contentType: 'video/mp4',
        verified: true,
        videoId,
        method: 'youtube_download',
        isValid: true,
        cleanup: () => {
          try {
            unlinkSync(tempFilePath);
            console.log('🗑️ TEMP FILE CLEANED:', tempFilePath);
          } catch (err) {
            console.log('⚠️ CLEANUP WARNING:', err);
          }
        }
      };
      
    } catch (error) {
      console.error('❌ YOUTUBE DOWNLOAD ERROR:', error);
      
      // Provide specific error messages for common issues
      let errorMessage = 'YouTube download failed';
      
      if (error instanceof Error) {
        if (error.message.includes('Could not extract functions')) {
          errorMessage = 'YouTube video extraction failed - this video may be restricted or require different access methods. Try using a different YouTube video or contact support for assistance.';
        } else if (error.message.includes('Video unavailable')) {
          errorMessage = 'YouTube video is unavailable - it may be private, deleted, or region-restricted';
        } else if (error.message.includes('Sign in to confirm')) {
          errorMessage = 'YouTube video requires age verification or sign-in - try a different video';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'YouTube download timed out - the video may be too large or server is busy';
        } else {
          errorMessage = `YouTube download failed: ${error.message}`;
        }
      }
      
      return {
        filePath: '',
        size: 0,
        contentType: 'video/mp4',
        verified: false,
        method: 'youtube_download',
        isValid: false,
        error: errorMessage,
        cleanup: () => {}
      };
    }
  }

  /**
   * Validate YouTube URL for download and Facebook upload
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

      // Check if video is accessible for download
      try {
        const info = await ytdl.getInfo(url);
        const formats = info.formats.filter(f => f.hasVideo && f.hasAudio);
        
        if (formats.length === 0) {
          return {
            isValid: false,
            recommendations: [
              'Video does not have downloadable formats',
              'Try a different YouTube video',
              'Ensure video is not age-restricted or private'
            ],
            error: 'No downloadable video formats available'
          };
        }

        recommendations.push('Video will be downloaded and uploaded as actual file to Facebook');
        recommendations.push('Supports large videos using Facebook resumable upload');
        recommendations.push('Works with both public and unlisted videos');
        recommendations.push('Note: Download time depends on video size and quality');

        return {
          isValid: true,
          videoId,
          recommendations
        };
      } catch (ytError) {
        return {
          isValid: false,
          recommendations: [
            'Video cannot be accessed for download',
            'Check if video is private, deleted, or region-restricted',
            'Try a different YouTube video URL'
          ],
          error: 'YouTube video access error: ' + (ytError instanceof Error ? ytError.message : 'Unknown error')
        };
      }

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
    return `YOUTUBE VIDEO DOWNLOAD FOR FACEBOOK UPLOAD:

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
   • Both work for download and Facebook upload

4. **Supported Formats**:
   • youtube.com/watch?v=VIDEO_ID (standard)
   • youtu.be/VIDEO_ID (short link)
   • youtube.com/embed/VIDEO_ID (embed)

✅ ADVANTAGES:
• Video downloaded and uploaded as actual file to Facebook
• Uses Facebook resumable upload for large videos (up to 1.75GB)
• Maintains original video quality
• Works with any video format uploaded to YouTube
• Automatic cleanup of temporary files

⚡ PROCESSING NOTES:
• Download time varies based on video size and quality
• Large videos use Facebook's resumable upload method
• Videos appear as native Facebook uploads, not links`;
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