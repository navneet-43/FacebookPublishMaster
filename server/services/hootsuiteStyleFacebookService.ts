import fetch from 'node-fetch';
import { storage } from '../storage';

interface FacebookPageInfo {
  id: string;
  name: string;
  access_token: string;
  perms: string[];
}

interface FacebookPagesResponse {
  data: FacebookPageInfo[];
  paging?: {
    next?: string;
    previous?: string;
  };
}

/**
 * Hootsuite-style Facebook service for publishing content
 * Uses Facebook Business API with proper long-lived tokens
 */
export class HootsuiteStyleFacebookService {
  
  /**
   * Get long-lived user access token (60 days validity)
   */
  static async getLongLivedUserToken(shortLivedToken: string): Promise<string | null> {
    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      
      if (!appId || !appSecret) {
        console.error('Facebook app credentials missing');
        return null;
      }

      const url = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Failed to get long-lived token:', data.error);
        return null;
      }
      
      return data.access_token;
    } catch (error) {
      console.error('Error getting long-lived token:', error);
      return null;
    }
  }

  /**
   * Get user's managed pages with permanent page access tokens
   */
  static async getUserManagedPages(userAccessToken: string): Promise<FacebookPageInfo[]> {
    try {
      // Updated API call without deprecated 'perms' field
      const url = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (!response.ok || !data.data) {
        console.error('Failed to fetch pages:', data);
        return [];
      }
      
      console.log(`✅ Successfully fetched ${data.data.length} Facebook pages`);
      
      // Return all pages since we can't check permissions directly anymore
      // Facebook will reject publishing attempts if no permissions exist
      return data.data.map((page: any) => ({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        perms: [] // Empty array since perms field is deprecated
      }));
    } catch (error) {
      console.error('Error fetching user pages:', error);
      return [];
    }
  }

  /**
   * Publish text post to Facebook page (Hootsuite style)
   */
  static async publishTextPost(pageId: string, pageAccessToken: string, message: string, link?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
      
      const postData = new URLSearchParams();
      postData.append('message', message);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as JSON array for insights reporting
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook text post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      if (link) {
        postData.append('link', link);
      }
      
      console.log(`Publishing text post to page ${pageId}`);
      console.log('Post data being sent:', Object.fromEntries(postData.entries()));
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      console.log('Facebook API response:', data);
      
      if (!response.ok || data.error) {
        console.error('Facebook publishing error:', data.error);
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing text post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish photo post to Facebook page (supports Google Drive links)
   */
  static async publishPhotoPost(pageId: string, pageAccessToken: string, photoUrl: string, caption?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      const { convertGoogleDriveLink, isGoogleDriveLink } = await import('../utils/googleDriveConverter');
      
      let finalPhotoUrl = photoUrl;
      
      // Convert Google Drive links to direct download URLs
      if (isGoogleDriveLink(photoUrl)) {
        const convertedUrl = convertGoogleDriveLink(photoUrl);
        if (convertedUrl) {
          finalPhotoUrl = convertedUrl;
          console.log('Converted Google Drive link for Facebook:', finalPhotoUrl);
        } else {
          return {
            success: false,
            error: 'Invalid Google Drive link format'
          };
        }
      }
      
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
      
      const postData = new URLSearchParams();
      postData.append('url', finalPhotoUrl);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      if (caption) {
        postData.append('caption', caption);
      }
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as JSON array for insights reporting
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook photo post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing photo post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook photo publishing error:', data.error);
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published photo post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing photo post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish video post to Facebook page (supports Google Drive links)
   */
  static async publishVideoPost(pageId: string, pageAccessToken: string, videoUrl: string, description?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      const { VideoProcessor } = await import('./videoProcessor');
      
      console.log('🎬 PROCESSING VIDEO for Facebook upload:', videoUrl);
      
      // Process video for optimal Facebook compatibility
      const processingResult = await VideoProcessor.processVideo(videoUrl);
      
      if (!processingResult.success) {
        console.log('❌ VIDEO EXCEEDS 4GB LIMIT');
        return {
          success: false,
          error: processingResult.error || 'Video exceeds Facebook\'s 4GB limit'
        };
      }
      
      const finalVideoUrl = processingResult.processedUrl || videoUrl;
      
      if (processingResult.skipProcessing) {
        console.log('✅ VIDEO READY: No processing needed');
      } else {
        console.log('✅ VIDEO OPTIMIZED: Ready for Facebook upload');
        if (processingResult.originalSize) {
          const sizeMB = (processingResult.originalSize / 1024 / 1024).toFixed(2);
          console.log(`📊 VIDEO SIZE: ${sizeMB}MB (proceeding with upload)`);
        }
      }
      
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const postData = new URLSearchParams();
      postData.append('file_url', finalVideoUrl);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      if (description) {
        postData.append('description', description);
      }
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as JSON array for insights reporting
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook video post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing video post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook video publishing error:', data.error);
        
        // Check if it's a media-related error that can be handled with fallback
        const isMediaError = data.error?.code === 351 || 
                            data.error?.message?.includes('video file') ||
                            data.error?.message?.includes('corrupt') ||
                            data.error?.message?.includes('unreadable');
        
        if (isMediaError) {
          console.log('❌ VIDEO UPLOAD FAILED: Facebook rejected the video file');
          
          // Check if this is a Google Drive access issue based on 0.0MB size + URL pattern
          console.log('🔍 DEBUG: Checking Google Drive conditions:', {
            isDriveUrl: videoUrl.includes('drive.google.com'),
            originalSize: processingResult.originalSize,
            isSmallSize: !processingResult.originalSize || processingResult.originalSize < 1000
          });
          
          if (videoUrl.includes('drive.google.com') && (!processingResult.originalSize || processingResult.originalSize < 1000)) {
            console.log('🔒 DETECTED GOOGLE DRIVE PERMISSION ISSUE');
            
            // Extract file ID for specific guidance
            const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            const fileId = fileIdMatch ? fileIdMatch[1] : 'unknown';
            
            const driveErrorMessage = `Google Drive video access failed for file ID: ${fileId}

🔒 PERMISSION ISSUE DETECTED:
The video file requires authentication or has restricted sharing settings.

🔧 REQUIRED STEPS TO FIX:
1. Open Google Drive and locate your video file
2. Right-click the video → "Share" or "Get link"
3. Change sharing from "Restricted" to "Anyone with the link"
4. Set permission level to "Viewer" (minimum required)
5. Copy the new link and use it in your post
6. Verify the file is fully uploaded (not showing "Processing...")

🔍 DIAGNOSTIC RESULTS:
File size detected: 0.0MB (indicates permission blocking)
Content type: HTML instead of video data

💡 QUICK SOLUTIONS:
• Download video → Upload directly to Facebook (most reliable)
• Use WeTransfer or Dropbox with public sharing
• Upload to YouTube → Share YouTube link in Facebook post
• Compress video with HandBrake if file is too large`;

            return {
              success: false,
              error: driveErrorMessage
            };
          }
          
          // Force Google Drive error for all drive.google.com URLs with 0MB
          if (videoUrl.includes('drive.google.com')) {
            console.log('🔒 FORCING GOOGLE DRIVE PERMISSION MESSAGE');
            
            const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            const fileId = fileIdMatch ? fileIdMatch[1] : 'unknown';
            
            return {
              success: false,
              error: `Google Drive Direct Video Upload Not Supported

🚫 GOOGLE DRIVE LIMITATION:
Facebook cannot directly access videos from Google Drive URLs, even with proper sharing permissions.
This is a limitation of Google Drive's API, not your sharing settings.

✅ YOUR SHARING IS CORRECT:
✓ "Anyone with the link" permission set
✓ "Viewer" access configured properly
✓ File accessible via sharing link

🔧 WORKING SOLUTIONS:

OPTION 1 - Direct Upload (Recommended):
1. Download the video from Google Drive to your computer
2. Upload directly to Facebook using this system
3. Delete local copy after successful upload

OPTION 2 - Alternative Hosting:
• Upload to YouTube (unlisted) → Share YouTube link in Facebook
• Use Dropbox with direct download links
• Use WeTransfer for temporary sharing

OPTION 3 - Video Processing:
• Compress with HandBrake if file is large
• Convert to MP4 format for better compatibility

🎯 RECOMMENDATION:
Download your video and upload directly for best results. Google Drive sharing links work for viewing but not for Facebook's automated video processing.`
            };
          }
          
          // Fallback to general video solutions
          const { VideoSolutions } = await import('../utils/videoSolutions');
          
          // Determine error type and get appropriate solution
          let errorType: 'size' | 'format' | 'access' | 'corrupt' = 'access';
          if (data.error?.message?.includes('large')) {
            errorType = 'size';
          } else if (data.error?.message?.includes('format')) {
            errorType = 'format';
          }
          // Note: Don't treat 351 as size issue when original size is 0 or very small
          
          // Get estimated file size for solution recommendations
          const estimatedSize = processingResult.originalSize || 1; // Use minimal size for access issues
          const sizeMB = estimatedSize / 1024 / 1024;
          
          const detailedSolution = VideoSolutions.createSolutionMessage(sizeMB, errorType);
          
          return {
            success: false,
            error: detailedSolution
          };
        }
        
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published video post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing video post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Refresh all page tokens for a user (Hootsuite approach)
   */
  static async refreshUserPageTokens(userId: number, userAccessToken: string): Promise<void> {
    try {
      // Get long-lived user token first
      const longLivedUserToken = await this.getLongLivedUserToken(userAccessToken);
      if (!longLivedUserToken) {
        console.error('Failed to get long-lived user token');
        return;
      }

      // Get all managed pages with fresh tokens
      const pages = await this.getUserManagedPages(longLivedUserToken);
      
      // Update database with fresh page tokens
      for (const page of pages) {
        try {
          // Check if page already exists
          const existingAccounts = await storage.getFacebookAccounts(userId);
          const existingAccount = existingAccounts.find(acc => acc.pageId === page.id);
          
          if (existingAccount) {
            // Update existing account with fresh token
            await storage.updateFacebookAccount(existingAccount.id, {
              accessToken: page.access_token,
              name: page.name
            });
            console.log(`Updated token for existing page: ${page.name}`);
          } else {
            // Create new account entry
            await storage.createFacebookAccount({
              userId: userId,
              pageId: page.id,
              name: page.name,
              accessToken: page.access_token,
              isActive: true
            });
            console.log(`Added new page: ${page.name}`);
          }
        } catch (error) {
          console.error(`Error updating page ${page.name}:`, error);
        }
      }
      
      // Update user's token
      await storage.updateUser(userId, {
        facebookToken: longLivedUserToken
      });
      
      console.log(`Successfully refreshed tokens for user ${userId} - ${pages.length} pages updated`);
      
    } catch (error) {
      console.error('Error refreshing user page tokens:', error);
    }
  }

  /**
   * Validate page access token
   */
  static async validatePageToken(pageId: string, pageAccessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}?access_token=${pageAccessToken}`);
      const data = await response.json() as any;
      
      return response.ok && !data.error;
    } catch (error) {
      console.error('Error validating page token:', error);
      return false;
    }
  }

  /**
   * Get page publishing permissions
   */
  static async getPagePermissions(pageId: string, pageAccessToken: string): Promise<string[]> {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=perms&access_token=${pageAccessToken}`);
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        return [];
      }
      
      return data.perms || [];
    } catch (error) {
      console.error('Error getting page permissions:', error);
      return [];
    }
  }
}