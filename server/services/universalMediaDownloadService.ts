import { CorrectGoogleDriveDownloader } from './correctGoogleDriveDownloader';
import { SharePointDownloadService } from './sharepointDownloadService';
import { FacebookVideoDownloadService } from './facebookVideoDownloadService';
import path from 'path';

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  sizeBytes?: number;
  source: 'google_drive' | 'sharepoint' | 'facebook' | 'unknown';
}

export class UniversalMediaDownloadService {
  /**
   * Universal media download service that supports multiple platforms
   * Currently supports: Google Drive, SharePoint, Facebook Videos
   */
  static async downloadMedia(url: string, customFilename?: string): Promise<DownloadResult> {
    try {
      console.log('🔗 Universal download initiated for:', url);

      // Determine the source platform
      const source = this.detectSourcePlatform(url);
      
      // Generate download path
      const filename = customFilename || this.generateFilename(url, source);
      const downloadPath = path.join('/tmp', filename);

      console.log(`📥 Downloading ${source} media to:`, downloadPath);

      let result: Omit<DownloadResult, 'source'>;

      // Route to appropriate download service
      switch (source) {
        case 'google_drive':
          result = await CorrectGoogleDriveDownloader.downloadFromGoogleDrive(url, downloadPath);
          break;
          
        case 'sharepoint':
          result = await SharePointDownloadService.downloadFromSharePoint(url, downloadPath);
          break;
          
        case 'facebook':
          result = await FacebookVideoDownloadService.downloadFromFacebook(url, downloadPath);
          break;
          
        default:
          result = {
            success: false,
            error: 'Unsupported URL format. Currently supported: Google Drive, SharePoint, and Facebook video links.'
          };
      }

      return {
        ...result,
        source
      };

    } catch (error) {
      console.error('❌ Universal download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown universal download error',
        source: 'unknown'
      };
    }
  }

  /**
   * Detect the source platform from URL
   */
  private static detectSourcePlatform(url: string): 'google_drive' | 'sharepoint' | 'facebook' | 'unknown' {
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      return 'google_drive';
    }
    
    if (SharePointDownloadService.isSharePointUrl(url)) {
      return 'sharepoint';
    }
    
    if (FacebookVideoDownloadService.isFacebookVideoUrl(url)) {
      return 'facebook';
    }
    
    return 'unknown';
  }

  /**
   * Generate appropriate filename based on source and URL
   */
  private static generateFilename(url: string, source: string): string {
    const timestamp = Date.now();
    
    switch (source) {
      case 'google_drive':
        return `google_drive_${Date.now()}.mp4`;
        
      case 'sharepoint':
        return SharePointDownloadService.extractFilename(url);
        
      case 'facebook':
        return FacebookVideoDownloadService.extractFilename(url);
        
      default:
        return `universal_media_${timestamp}.mp4`;
    }
  }

  /**
   * Check if a URL is supported by the universal download service
   */
  static isSupportedUrl(url: string): boolean {
    return (url.includes('drive.google.com') || url.includes('docs.google.com')) ||
           SharePointDownloadService.isSharePointUrl(url) ||
           FacebookVideoDownloadService.isFacebookVideoUrl(url);
  }

  /**
   * Get supported platform information
   */
  static getSupportedPlatforms(): Array<{ name: string; description: string; example: string }> {
    return [
      {
        name: 'Google Drive',
        description: 'Direct file links and sharing links from Google Drive',
        example: 'https://drive.google.com/file/d/1ABC123/view'
      },
      {
        name: 'SharePoint',
        description: 'Files from SharePoint Online and OneDrive for Business',
        example: 'https://company.sharepoint.com/sites/team/Documents/video.mp4'
      },
      {
        name: 'Facebook Videos',
        description: 'Public Facebook video posts',
        example: 'https://www.facebook.com/watch/?v=123456789'
      }
    ];
  }

  /**
   * Validate and provide feedback on URL format
   */
  static validateUrl(url: string): { isValid: boolean; platform?: string; suggestion?: string } {
    if (!url || typeof url !== 'string') {
      return {
        isValid: false,
        suggestion: 'Please provide a valid URL'
      };
    }

    // Check for basic URL format
    try {
      new URL(url);
    } catch {
      return {
        isValid: false,
        suggestion: 'Please provide a valid URL starting with http:// or https://'
      };
    }

    const platform = this.detectSourcePlatform(url);
    
    if (platform === 'unknown') {
      return {
        isValid: false,
        suggestion: 'This URL format is not supported. Currently supported: Google Drive, SharePoint, and Facebook video links.'
      };
    }

    return {
      isValid: true,
      platform
    };
  }
}