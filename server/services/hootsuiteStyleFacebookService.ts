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
      const url = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,perms&access_token=${userAccessToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as FacebookPagesResponse;
      
      if (!response.ok || !data.data) {
        console.error('Failed to fetch pages:', data);
        return [];
      }
      
      // Filter pages with publishing permissions
      return data.data.filter(page => 
        page.perms && (
          page.perms.includes('MANAGE') || 
          page.perms.includes('CREATE_CONTENT') ||
          page.perms.includes('MODERATE') ||
          page.perms.includes('ADVERTISE')
        )
      );
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
      
      // Add custom labels for insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as comma-separated string, not JSON array
        const labelsString = customLabels.join(',');
        postData.append('custom_labels', labelsString);
        console.log('Adding custom labels to Facebook text post:', labelsString);
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      if (link) {
        postData.append('link', link);
      }
      
      console.log(`Publishing text post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
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
      
      if (caption) {
        postData.append('caption', caption);
      }
      
      // Add custom labels for insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        postData.append('custom_labels', JSON.stringify(customLabels));
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
      const { convertGoogleDriveLink, isGoogleDriveLink } = await import('../utils/googleDriveConverter');
      
      let finalVideoUrl = videoUrl;
      
      // Convert Google Drive links to direct download URLs
      if (isGoogleDriveLink(videoUrl)) {
        const convertedUrl = convertGoogleDriveLink(videoUrl);
        if (convertedUrl) {
          finalVideoUrl = convertedUrl;
          console.log('Converted Google Drive link for Facebook video:', finalVideoUrl);
        } else {
          return {
            success: false,
            error: 'Invalid Google Drive link format'
          };
        }
      }
      
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const postData = new URLSearchParams();
      postData.append('file_url', finalVideoUrl);
      postData.append('access_token', pageAccessToken);
      
      if (description) {
        postData.append('description', description);
      }
      
      // Add custom labels for insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        postData.append('custom_labels', JSON.stringify(customLabels));
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