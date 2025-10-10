import fetch from 'node-fetch';

interface InstagramBusinessAccount {
  id: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
}

interface MediaContainerResult {
  success: boolean;
  containerId?: string;
  error?: string;
}

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Instagram Service - Handles Instagram Business Account publishing via Meta Graph API
 * 
 * Requirements:
 * - Instagram Business or Creator Account
 * - Connected to a Facebook Page
 * - Permissions: instagram_basic, instagram_content_publish
 */
export class InstagramService {
  
  private static readonly GRAPH_API_VERSION = 'v21.0';
  private static readonly GRAPH_API_BASE = `https://graph.facebook.com/${this.GRAPH_API_VERSION}`;

  /**
   * Get Instagram Business Accounts connected to Facebook Pages
   */
  static async getInstagramAccountsFromPages(pageAccessToken: string): Promise<{
    success: boolean;
    accounts?: InstagramBusinessAccount[];
    error?: string;
  }> {
    try {
      // Get Instagram Business Account from Facebook Page
      const response = await fetch(
        `${this.GRAPH_API_BASE}/me/accounts?fields=instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${pageAccessToken}`
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || 'Failed to fetch Instagram accounts'
        };
      }

      const accounts: InstagramBusinessAccount[] = [];
      
      if (data.data) {
        for (const page of data.data) {
          if (page.instagram_business_account) {
            accounts.push({
              id: page.instagram_business_account.id,
              username: page.instagram_business_account.username,
              profile_picture_url: page.instagram_business_account.profile_picture_url,
              followers_count: page.instagram_business_account.followers_count
            });
          }
        }
      }

      return {
        success: true,
        accounts
      };
    } catch (error) {
      console.error('Error fetching Instagram accounts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Step 1: Create media container
   * This prepares the media for publishing
   */
  static async createMediaContainer(
    igUserId: string,
    accessToken: string,
    options: {
      imageUrl?: string;
      videoUrl?: string;
      caption?: string;
      mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM' | 'STORIES';
      coverUrl?: string; // For videos
      children?: string[]; // For carousels (container IDs)
    }
  ): Promise<MediaContainerResult> {
    try {
      const params = new URLSearchParams({
        access_token: accessToken
      });

      // Add caption if provided
      if (options.caption) {
        params.append('caption', options.caption);
      }

      // Handle different media types
      if (options.mediaType === 'REELS') {
        if (!options.videoUrl) {
          return { success: false, error: 'Video URL required for Reels' };
        }
        params.append('media_type', 'REELS');
        params.append('video_url', options.videoUrl);
        if (options.coverUrl) {
          params.append('cover_url', options.coverUrl);
        }
      } else if (options.mediaType === 'STORIES') {
        params.append('media_type', 'STORIES');
        if (options.imageUrl) {
          params.append('image_url', options.imageUrl);
        } else if (options.videoUrl) {
          params.append('video_url', options.videoUrl);
        }
      } else if (options.mediaType === 'CAROUSEL_ALBUM') {
        if (!options.children || options.children.length === 0) {
          return { success: false, error: 'Children containers required for carousel' };
        }
        params.append('media_type', 'CAROUSEL');
        params.append('children', options.children.join(','));
      } else {
        // Single image or video
        if (options.imageUrl) {
          params.append('image_url', options.imageUrl);
        } else if (options.videoUrl) {
          params.append('video_url', options.videoUrl);
          if (options.coverUrl) {
            params.append('thumb_offset', '0');
          }
        } else {
          return { success: false, error: 'Either image_url or video_url is required' };
        }
      }

      const response = await fetch(
        `${this.GRAPH_API_BASE}/${igUserId}/media`,
        {
          method: 'POST',
          body: params
        }
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        console.error('❌ Instagram container creation failed:', data.error);
        return {
          success: false,
          error: data.error?.message || 'Failed to create media container'
        };
      }

      console.log('✅ Instagram media container created:', data.id);
      
      return {
        success: true,
        containerId: data.id
      };
    } catch (error) {
      console.error('Error creating Instagram media container:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Step 2: Publish media container
   * This actually publishes the post to Instagram
   */
  static async publishMediaContainer(
    igUserId: string,
    containerId: string,
    accessToken: string
  ): Promise<PublishResult> {
    try {
      const params = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken
      });

      const response = await fetch(
        `${this.GRAPH_API_BASE}/${igUserId}/media_publish`,
        {
          method: 'POST',
          body: params
        }
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        console.error('❌ Instagram publish failed:', data.error);
        return {
          success: false,
          error: data.error?.message || 'Failed to publish media'
        };
      }

      console.log('✅ Instagram post published:', data.id);
      
      return {
        success: true,
        postId: data.id
      };
    } catch (error) {
      console.error('Error publishing Instagram media:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check media container status
   * Important for videos - must wait for processing before publishing
   */
  static async checkContainerStatus(
    containerId: string,
    accessToken: string
  ): Promise<{ ready: boolean; statusCode?: string; error?: string }> {
    try {
      const response = await fetch(
        `${this.GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        return {
          ready: false,
          error: data.error?.message || 'Failed to check status'
        };
      }

      // Status codes: FINISHED, IN_PROGRESS, ERROR
      return {
        ready: data.status_code === 'FINISHED',
        statusCode: data.status_code
      };
    } catch (error) {
      return {
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Complete publishing flow with automatic status checking for videos
   */
  static async publishPost(
    igUserId: string,
    accessToken: string,
    options: {
      imageUrl?: string;
      videoUrl?: string;
      caption?: string;
      mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM' | 'STORIES';
      coverUrl?: string;
      children?: string[];
    }
  ): Promise<PublishResult> {
    // Step 1: Create media container
    const containerResult = await this.createMediaContainer(igUserId, accessToken, options);
    
    if (!containerResult.success || !containerResult.containerId) {
      return {
        success: false,
        error: containerResult.error || 'Failed to create container'
      };
    }

    // Step 2: Wait for processing (especially for videos)
    if (options.videoUrl || options.mediaType === 'REELS') {
      console.log('⏳ Waiting for video processing...');
      
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const statusCheck = await this.checkContainerStatus(containerResult.containerId, accessToken);
        
        if (statusCheck.ready) {
          console.log('✅ Video processing complete');
          break;
        }
        
        if (statusCheck.statusCode === 'ERROR') {
          return {
            success: false,
            error: 'Video processing failed'
          };
        }
        
        attempts++;
        console.log(`⏳ Processing... (${attempts}/${maxAttempts})`);
      }
      
      if (attempts >= maxAttempts) {
        return {
          success: false,
          error: 'Video processing timeout - try again later'
        };
      }
    } else {
      // For images, wait a short time
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 3: Publish
    return await this.publishMediaContainer(igUserId, containerResult.containerId, accessToken);
  }

  /**
   * Get Instagram insights/analytics
   */
  static async getInsights(
    igUserId: string,
    accessToken: string,
    metrics: string[] = ['impressions', 'reach', 'engagement']
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.GRAPH_API_BASE}/${igUserId}/insights?metric=${metrics.join(',')}&period=day&access_token=${accessToken}`
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Instagram insights:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
