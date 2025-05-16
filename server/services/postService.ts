import schedule from 'node-schedule';
import { storage } from '../storage';
import { Post } from '@shared/schema';
import fetch from 'node-fetch';

// Store active job schedules by post ID
const activeJobs: Record<number, schedule.Job> = {};

/**
 * Publish a post to Facebook
 * @param post The post to publish
 * @returns Result of the operation
 */
export async function publishPostToFacebook(post: Post): Promise<{success: boolean, data?: any, error?: string}> {
  try {
    // Verify post has all required data
    if (!post.accountId) {
      return { success: false, error: 'No Facebook account selected for this post' };
    }
    
    if (!post.content && !post.mediaUrl) {
      return { success: false, error: 'Post must have content or media' };
    }
    
    // Get the Facebook account
    const account = await storage.getFacebookAccount(post.accountId);
    if (!account) {
      return { success: false, error: 'Facebook account not found' };
    }
    
    if (!account.accessToken) {
      return { success: false, error: 'Facebook account is not properly authenticated' };
    }
    
    // Prepare post data for Facebook API
    const postData: Record<string, any> = {};
    
    // Add post message
    if (post.content) {
      postData.message = post.content;
    }
    
    // Add media if present
    if (post.mediaUrl) {
      // Check file type to determine post type
      const isVideo = post.mediaUrl.match(/\.(mp4|mov|avi|wmv|flv|webm)$/i);
      
      if (isVideo) {
        // Video post
        postData.description = post.content || '';
        postData.file_url = post.mediaUrl;
      } else {
        // Photo post
        postData.url = post.mediaUrl;
        postData.caption = post.content || '';
      }
    }
    
    // Add link if present
    if (post.link) {
      postData.link = post.link;
    }
    
    // Determine endpoint based on media type
    let endpoint = `https://graph.facebook.com/v16.0/${account.pageId}/feed`;
    
    if (post.mediaUrl) {
      const isVideo = post.mediaUrl.match(/\.(mp4|mov|avi|wmv|flv|webm)$/i);
      if (isVideo) {
        endpoint = `https://graph.facebook.com/v16.0/${account.pageId}/videos`;
      } else {
        endpoint = `https://graph.facebook.com/v16.0/${account.pageId}/photos`;
      }
    }
    
    // Make API request to Facebook
    const response = await fetch(`${endpoint}?access_token=${account.accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postData)
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      console.error('Facebook API error:', data);
      return { 
        success: false, 
        error: data.error?.message || 'Failed to publish to Facebook',
        data: data
      };
    }
    
    // Log activity for successful publication
    await storage.createActivity({
      userId: post.userId || null,
      type: 'post_published',
      description: 'Post published to Facebook',
      metadata: { 
        postId: post.id,
        facebookResponse: data
      }
    });
    
    return { success: true, data };
  } catch (error) {
    console.error('Error publishing to Facebook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Schedule a post for future publication
 * @param post The post to schedule
 */
export function schedulePostPublication(post: Post): void {
  if (!post.scheduledFor || post.status !== 'scheduled') {
    console.warn(`Post ${post.id} is not scheduled or has no scheduled date`);
    return;
  }
  
  // Cancel any existing job for this post
  if (activeJobs[post.id]) {
    activeJobs[post.id].cancel();
    delete activeJobs[post.id];
  }
  
  const scheduledTime = new Date(post.scheduledFor);
  if (scheduledTime <= new Date()) {
    console.warn(`Post ${post.id} scheduled time is in the past`);
    return;
  }
  
  // Schedule new job
  activeJobs[post.id] = schedule.scheduleJob(scheduledTime, async () => {
    try {
      console.log(`Executing scheduled post ${post.id}`);
      
      // Get latest post data
      const currentPost = await storage.getPost(post.id);
      if (!currentPost || currentPost.status !== 'scheduled') {
        console.warn(`Post ${post.id} no longer exists or is not scheduled`);
        return;
      }
      
      // Publish to Facebook
      const result = await publishPostToFacebook(currentPost);
      
      if (result.success) {
        // Update post status
        await storage.updatePost(post.id, {
          status: 'published',
          publishedAt: new Date()
        });
        
        // Log activity
        await storage.createActivity({
          userId: currentPost.userId || null,
          type: 'post_published',
          description: 'Scheduled post published',
          metadata: { postId: currentPost.id }
        });
        
        console.log(`Successfully published scheduled post ${post.id}`);
      } else {
        // Handle failure
        await storage.updatePost(post.id, {
          status: 'failed',
          errorMessage: result.error || 'Unknown error during scheduled publication'
        });
        
        // Log activity
        await storage.createActivity({
          userId: currentPost.userId || null,
          type: 'post_failed',
          description: 'Scheduled post failed to publish',
          metadata: { 
            postId: currentPost.id,
            error: result.error
          }
        });
        
        console.error(`Failed to publish scheduled post ${post.id}:`, result.error);
      }
    } catch (error) {
      console.error(`Error executing scheduled post ${post.id}:`, error);
      
      try {
        // Update post status to failed
        await storage.updatePost(post.id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error during scheduled publication'
        });
      } catch (updateError) {
        console.error(`Error updating post ${post.id} status:`, updateError);
      }
    } finally {
      // Remove the job from active jobs
      delete activeJobs[post.id];
    }
  });
  
  console.log(`Post ${post.id} scheduled for publication at ${scheduledTime.toISOString()}`);
}

/**
 * Initialize scheduling for all scheduled posts
 * Call this when the server starts
 */
export async function initializeScheduledPosts(): Promise<void> {
  try {
    // Get all scheduled posts
    const scheduledPosts = await storage.getScheduledPosts();
    let scheduledCount = 0;
    
    // Schedule each post
    for (const post of scheduledPosts) {
      schedulePostPublication(post);
      scheduledCount++;
    }
    
    console.log(`Initialized ${scheduledCount} scheduled posts`);
  } catch (error) {
    console.error("Error initializing scheduled posts:", error);
  }
}

/**
 * Handler for scheduled posts that failed to publish
 * This can be run periodically to retry failed posts
 */
export async function retryFailedPosts(): Promise<void> {
  try {
    // Get all failed posts directly
    const failedPosts = await storage.getFailedPosts();
    let retriedCount = 0;
    
    // Retry each failed post
    for (const post of failedPosts) {
      try {
        // Only retry posts that failed within the last 24 hours
        const failedAt = post.publishedAt || post.createdAt;
        if (!failedAt) continue; // Skip if no timestamp available
        
        const timeSinceFailed = Date.now() - new Date(failedAt).getTime();
        const hoursSinceFailed = timeSinceFailed / (1000 * 60 * 60);
        
        if (hoursSinceFailed <= 24) {
          await publishPostToFacebook(post);
          retriedCount++;
        }
      } catch (error) {
        console.error(`Error retrying failed post ${post.id}:`, error);
      }
    }
    
    console.log(`Retried ${retriedCount} failed posts`);
  } catch (error) {
    console.error("Error retrying failed posts:", error);
  }
}

/**
 * Cancel a scheduled post
 */
export async function cancelScheduledPost(postId: number): Promise<boolean> {
  try {
    if (activeJobs[postId]) {
      activeJobs[postId].cancel();
      delete activeJobs[postId];
      console.log(`Cancelled scheduled post ${postId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error cancelling scheduled post ${postId}:`, error);
    return false;
  }
}

/**
 * Get upcoming posts for the next N days
 */
export async function getUpcomingPostsForDays(userId: number, days: number = 7): Promise<Post[]> {
  const now = new Date();
  const endDate = new Date();
  endDate.setDate(now.getDate() + days);
  
  const allPosts = await storage.getPosts(userId);
  
  return allPosts.filter(post => {
    // Only include scheduled posts
    if (post.status !== 'scheduled') return false;
    
    // Check if post has a scheduled date
    if (!post.scheduledFor) return false;
    
    // Check if post is scheduled within the date range
    const scheduledDate = new Date(post.scheduledFor);
    return scheduledDate >= now && scheduledDate <= endDate;
  });
}

// Export as a service object for use in other modules
export const postService = {
  publishPostToFacebook,
  schedulePostPublication,
  initializeScheduledPosts,
  retryFailedPosts,
  cancelScheduledPost,
  getUpcomingPostsForDays
};