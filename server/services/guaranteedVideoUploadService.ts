import { EnhancedGoogleDriveService } from './enhancedGoogleDriveService';
import { ActualVideoOnlyService } from './actualVideoOnlyService';

export class GuaranteedVideoUploadService {
  /**
   * Guaranteed video upload with enhanced processing for all video sources
   */
  static async uploadVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    content: string,
    customLabels: string[] = [],
    language: string = 'en'
  ) {
    console.log('🎯 GUARANTEED VIDEO UPLOAD SERVICE');
    console.log(`📺 Video URL: ${videoUrl}`);
    console.log(`📄 Target Page: ${pageId}`);

    try {
      // Determine video source and use appropriate enhanced service
      if (this.isGoogleDriveUrl(videoUrl)) {
        console.log('🚀 Processing Google Drive video with enhanced service');
        
        const result = await EnhancedGoogleDriveService.downloadAndUpload(
          pageId,
          accessToken,
          videoUrl,
          content,
          customLabels,
          language
        );

        return {
          success: true,
          postId: result.postId,
          source: 'Google Drive',
          sizeMB: result.sizeMB,
          downloadTime: result.downloadTime,
          url: result.url,
          message: `Google Drive video successfully uploaded: ${result.sizeMB.toFixed(1)}MB`
        };

      } else if (this.isYouTubeUrl(videoUrl)) {
        console.log('🚀 Processing YouTube video with existing service');
        
        const result = await ActualVideoOnlyService.uploadVideo(
          pageId,
          accessToken,
          videoUrl,
          content,
          customLabels,
          language
        );

        if (!result.success) {
          throw new Error(result.error || 'YouTube upload failed');
        }

        return {
          success: true,
          postId: result.postId,
          source: 'YouTube',
          url: `https://facebook.com/${result.postId}`,
          message: 'YouTube video successfully uploaded'
        };

      } else {
        console.log('🚀 Processing direct video URL');
        
        const result = await ActualVideoOnlyService.uploadVideo(
          pageId,
          accessToken,
          videoUrl,
          content,
          customLabels,
          language
        );

        if (!result.success) {
          throw new Error(result.error || 'Direct URL upload failed');
        }

        return {
          success: true,
          postId: result.postId,
          source: 'Direct URL',
          url: `https://facebook.com/${result.postId}`,
          message: 'Direct video URL successfully uploaded'
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Guaranteed upload failed:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        source: this.getVideoSource(videoUrl),
        message: `Upload failed: ${errorMessage}`
      };
    }
  }

  /**
   * Test the enhanced video upload system
   */
  static async testSystem(pageId: string, accessToken: string) {
    console.log('🧪 TESTING GUARANTEED VIDEO UPLOAD SYSTEM');
    
    const testVideos = [
      {
        url: 'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link',
        type: 'Google Drive',
        content: 'Enhanced Google Drive video upload test - guaranteed completion'
      },
      {
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        type: 'YouTube',
        content: 'YouTube video upload test with guaranteed service'
      }
    ];

    const results = [];

    for (const test of testVideos) {
      console.log(`\n🎬 Testing ${test.type} upload...`);
      
      try {
        const result = await this.uploadVideo(
          pageId,
          accessToken,
          test.url,
          test.content,
          ['test', 'guaranteed-upload', test.type.toLowerCase().replace(' ', '-')],
          'en'
        );

        results.push({
          type: test.type,
          success: result.success,
          postId: result.postId,
          url: result.url,
          message: result.message,
          details: result
        });

        if (result.success) {
          console.log(`✅ ${test.type} test successful: ${result.url}`);
        } else {
          console.log(`❌ ${test.type} test failed: ${result.error}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`❌ ${test.type} test error: ${errorMessage}`);
        results.push({
          type: test.type,
          success: false,
          error: errorMessage
        });
      }
    }

    return {
      success: results.some(r => r.success),
      results,
      summary: `Tested ${results.length} video sources, ${results.filter(r => r.success).length} successful`
    };
  }

  /**
   * Check if URL is a Google Drive video
   */
  private static isGoogleDriveUrl(url: string): boolean {
    return url.includes('drive.google.com') || url.includes('drive.usercontent.google.com');
  }

  /**
   * Check if URL is a YouTube video
   */
  private static isYouTubeUrl(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  /**
   * Get video source type
   */
  private static getVideoSource(url: string): string {
    if (this.isGoogleDriveUrl(url)) return 'Google Drive';
    if (this.isYouTubeUrl(url)) return 'YouTube';
    return 'Direct URL';
  }
}