import ytdl from 'ytdl-core';
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
      // Get video info first
      const info = await ytdl.getInfo(originalUrl);
      console.log('🔍 YOUTUBE VIDEO INFO:', info.videoDetails.title);
      
      // Choose best quality format
      const format = ytdl.chooseFormat(info.formats, { 
        quality: 'highest',
        filter: 'videoandaudio'
      });
      
      console.log('📹 SELECTED FORMAT:', format.qualityLabel, format.container);
      
      // Create temporary file path
      const tempFilePath = join(tmpdir(), `youtube_${videoId}_${Date.now()}.mp4`);
      
      // Download video
      await new Promise<void>((resolve, reject) => {
        const stream = ytdl(originalUrl, { format });
        const writeStream = createWriteStream(tempFilePath);
        
        stream.pipe(writeStream);
        
        stream.on('progress', (chunkLength, downloaded, total) => {
          const percent = (downloaded / total * 100).toFixed(1);
          console.log(`📥 DOWNLOAD PROGRESS: ${percent}% - ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
        });
        
        writeStream.on('finish', () => {
          console.log('✅ YOUTUBE VIDEO DOWNLOADED:', tempFilePath);
          resolve();
        });
        
        stream.on('error', reject);
        writeStream.on('error', reject);
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