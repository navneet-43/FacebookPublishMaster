import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// SharePoint Web API endpoints for file access
const SHAREPOINT_API_ENDPOINTS = {
  // Format: https://domain/_api/web/getfilebyserverrelativeurl('/path/to/file')/$value
  GET_FILE_BY_URL: '/_api/web/getfilebyserverrelativeurl',
  // Format: https://domain/_api/v2.0/drives/driveId/items/itemId/content
  GRAPH_API: '/_api/v2.0/drives'
};

export class SharePointDownloadService {
  /**
   * Download a file from SharePoint using various link formats
   * Supports both direct download links and view links
   */
  static async downloadFromSharePoint(sharePointUrl: string, downloadPath: string): Promise<{ success: boolean; filePath?: string; error?: string; sizeBytes?: number }> {
    try {
      console.log('🔗 Processing SharePoint URL:', sharePointUrl);
      
      // Try multiple SharePoint download approaches
      const downloadResult = await this.attemptSharePointDownload(sharePointUrl, downloadPath);
      return downloadResult;

      // This method is no longer used - replaced by attemptSharePointDownload

    } catch (error) {
      console.error('❌ SharePoint download error:', error);
      
      // Clean up partial download
      if (fs.existsSync(downloadPath)) {
        try {
          fs.unlinkSync(downloadPath);
        } catch (cleanupError) {
          console.error('⚠️ Failed to clean up partial download:', cleanupError);
        }
      }

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown SharePoint download error' 
      };
    }
  }

  /**
   * Extract direct download URL from SharePoint redirect chain
   */
  private static async getDirectDownloadUrl(sharePointUrl: string): Promise<string | null> {
    try {
      console.log('🔗 Extracting direct download URL from SharePoint...');
      
      // Step 1: Follow the redirect to get the stream.aspx URL
      const response = await fetch(sharePointUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        redirect: 'manual' // Don't auto-follow redirects
      });

      if (response.status === 302) {
        const redirectUrl = response.headers.get('location');
        console.log('📍 SharePoint redirect URL:', redirectUrl);
        
        if (redirectUrl && redirectUrl.includes('stream.aspx')) {
          // Extract file ID from the redirect URL
          const streamUrl = new URL(redirectUrl);
          const fileId = streamUrl.searchParams.get('id');
          
          if (fileId) {
            console.log('🆔 Extracted file ID:', fileId);
            console.log('🔍 Decoded file path:', decodeURIComponent(fileId));
            
            // Construct the direct download URL using the actual file path
            const baseUrl = `${streamUrl.protocol}//${streamUrl.hostname}`;
            
            // Method 1: Use SharePoint's direct file access with download parameter
            const directFileUrl = `${baseUrl}${fileId}?download=1`;
            console.log('🔗 Method 1 - Direct file URL:', directFileUrl);
            
            // Method 2: Use SharePoint's download API (backup)
            const downloadApiUrl = `${baseUrl}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(baseUrl + fileId)}`;
            console.log('🔗 Method 2 - Download API URL:', downloadApiUrl);
            
            // Return the direct file URL first, as it's more reliable
            return directFileUrl;
          }
        }
      }

      // Fallback: Try multiple conversion approaches
      return this.convertToDirectDownloadUrl(sharePointUrl);

    } catch (error) {
      console.error('❌ Error extracting SharePoint download URL:', error);
      return this.convertToDirectDownloadUrl(sharePointUrl);
    }
  }

  /**
   * Convert SharePoint view URL to direct download URL (fallback method)
   */
  private static convertToDirectDownloadUrl(sharePointUrl: string): string | null {
    try {
      console.log('🔄 Converting SharePoint URL to download format...');
      
      // Handle SharePoint :v: format URLs
      if (sharePointUrl.includes('sharepoint.com') && sharePointUrl.includes(':v:')) {
        const urlObj = new URL(sharePointUrl);
        
        // Method 1: Try to decode the file path from the URL structure
        const pathname = urlObj.pathname;
        const pathParts = pathname.split(':v:');
        
        if (pathParts.length >= 2) {
          const basePath = pathParts[0]; // /personal/user_domain_com
          const filePath = pathParts[1]; // /g/path/to/file.mp4
          
          // Construct the actual file path
          const actualPath = basePath + '/Documents' + filePath;
          const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          
          // Try direct file access with download parameter
          const directUrl = `${baseUrl}${actualPath}?download=1`;
          console.log('🔗 Method 1 - Direct file URL:', directUrl);
          return directUrl;
        }
      }

      // Method 2: Use SharePoint's download API
      if (sharePointUrl.includes('sharepoint.com')) {
        const urlObj = new URL(sharePointUrl);
        const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
        
        // Use SharePoint's download.aspx endpoint
        const downloadUrl = `${baseUrl}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(sharePointUrl)}`;
        console.log('🔗 Method 2 - Download API URL:', downloadUrl);
        return downloadUrl;
      }

      // Method 3: Add download parameter to original URL
      if (sharePointUrl.includes('sharepoint.com') || sharePointUrl.includes('1drv.ms')) {
        const url = new URL(sharePointUrl);
        url.searchParams.set('download', '1');
        const paramUrl = url.toString();
        console.log('🔗 Method 3 - Parameter URL:', paramUrl);
        return paramUrl;
      }

      console.log('⚠️ Could not convert SharePoint URL');
      return sharePointUrl; // Return original as fallback

    } catch (error) {
      console.error('❌ Error converting SharePoint URL:', error);
      return sharePointUrl;
    }
  }

  /**
   * Validate if a URL appears to be a SharePoint link
   */
  static isSharePointUrl(url: string): boolean {
    return url.includes('sharepoint.com') || 
           url.includes('1drv.ms') || 
           url.includes('onedrive.live.com') ||
           url.includes('officeapps.live.com');
  }

  /**
   * Extract filename from SharePoint URL
   */
  static extractFilename(sharePointUrl: string): string {
    try {
      const url = new URL(sharePointUrl);
      const pathname = url.pathname;
      
      // Extract filename from path
      const segments = pathname.split('/');
      const filename = segments[segments.length - 1];
      
      if (filename && filename.includes('.')) {
        return decodeURIComponent(filename);
      }
      
      // Fallback to timestamp-based filename
      return `sharepoint_file_${Date.now()}.mp4`;
      
    } catch (error) {
      console.error('❌ Error extracting SharePoint filename:', error);
      return `sharepoint_file_${Date.now()}.mp4`;
    }
  }
}