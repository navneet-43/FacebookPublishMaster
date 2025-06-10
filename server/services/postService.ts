import schedule from 'node-schedule';
import { storage } from '../storage';
import { Post } from '@shared/schema';
import fetch from 'node-fetch';

// Store active job schedules by post ID
const activeJobs: Record<number, schedule.Job> = {};

/**
 * Publish a post to Facebook using Hootsuite-style approach
 * @param post The post to publish
 * @returns Result of the operation
 */
export async function publishPostToFacebook(post: Post): Promise<{success: boolean, data?: any, error?: string}> {
  try {
    // Import Hootsuite-style service
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
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
    
    // Validate token before using it
    const isValidToken = await HootsuiteStyleFacebookService.validatePageToken(account.pageId, account.accessToken);
    if (!isValidToken) {
      console.log('Invalid page token detected, attempting refresh...');
      return { 
        success: false, 
        error: 'Facebook access token is invalid or expired. Please refresh your Facebook connection.' 
      };
    }
    
    console.log(`Publishing post ${post.id} to Facebook page: ${account.name} (${account.pageId})`);
    
    let result;
    
    // Determine post type based on mediaType and publish accordingly
    if (post.mediaUrl && post.mediaType && post.mediaType !== 'none') {
      switch (post.mediaType) {
        case 'photo':
          result = await HootsuiteStyleFacebookService.publishPhotoPost(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            post.labels || undefined,
            post.language || undefined
          );
          break;
          
        case 'video':
        case 'reel':
          result = await HootsuiteStyleFacebookService.publishVideoPost(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            post.labels || undefined,
            post.language || undefined
          );
          break;
          
        default:
          // Fallback to text post with media as link
          result = await HootsuiteStyleFacebookService.publishTextPost(
            account.pageId,
            account.accessToken,
            post.content || 'Check out this content!',
            post.mediaUrl,
            post.labels || undefined,
            post.language || undefined
          );
      }
    } else {
      // Text-only post
      result = await HootsuiteStyleFacebookService.publishTextPost(
        account.pageId,
        account.accessToken,
        post.content!,
        post.link || undefined,
        post.labels || undefined,
        post.language || undefined
      );
    }
    
    if (result.success) {
      // Log activity for successful publication
      await storage.createActivity({
        userId: post.userId || null,
        type: 'post_published',
        description: `Post published to Facebook page: ${account.name}`,
        metadata: { 
          postId: post.id,
          facebookPostId: result.postId,
          pageId: account.pageId,
          customLabels: post.labels,
          language: post.language,
          mediaType: post.mediaType
        }
      });
      
      console.log(`Successfully published post ${post.id} to Facebook. FB Post ID: ${result.postId}`);
      
      return { 
        success: true, 
        data: { 
          facebookPostId: result.postId,
          pageId: account.pageId,
          pageName: account.name
        }
      };
    } else {
      console.error(`Failed to publish post ${post.id} to Facebook:`, result.error);
      return { 
        success: false, 
        error: result.error || 'Unknown Facebook publishing error'
      };
    }
    
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
  console.log(`🔍 SCHEDULE DEBUG: Attempting to schedule post ${post.id}`);
  console.log(`🔍 Post status: ${post.status}`);
  console.log(`🔍 Scheduled for: ${post.scheduledFor}`);
  
  if (!post.scheduledFor || post.status !== 'scheduled') {
    console.warn(`❌ Post ${post.id} is not scheduled or has no scheduled date`);
    console.warn(`❌ Status: ${post.status}, ScheduledFor: ${post.scheduledFor}`);
    return;
  }
  
  // Cancel any existing job for this post
  if (activeJobs[post.id]) {
    console.log(`🔄 Canceling existing job for post ${post.id}`);
    activeJobs[post.id].cancel();
    delete activeJobs[post.id];
  }
  
  const scheduledTime = new Date(post.scheduledFor);
  const now = new Date();
  console.log(`🕐 Current time: ${now.toISOString()}`);
  console.log(`🕐 Scheduled time: ${scheduledTime.toISOString()}`);
  console.log(`🕐 Time difference (ms): ${scheduledTime.getTime() - now.getTime()}`);
  
  if (scheduledTime <= now) {
    console.warn(`❌ Post ${post.id} scheduled time is in the past`);
    console.warn(`❌ Scheduled: ${scheduledTime.toISOString()}, Current: ${now.toISOString()}`);
    return;
  }
  
  // Schedule new job
  console.log(`✅ SCHEDULING: Creating job for post ${post.id} at ${scheduledTime.toISOString()}`);
  activeJobs[post.id] = schedule.scheduleJob(scheduledTime, async () => {
    try {
      console.log(`🚀 EXECUTING SCHEDULED POST: ${post.id} at ${new Date().toISOString()}`);
      
      // Get latest post data
      const currentPost = await storage.getPost(post.id);
      if (!currentPost || currentPost.status !== 'scheduled') {
        console.warn(`❌ SCHEDULED EXECUTION FAILED: Post ${post.id} no longer exists or is not scheduled`);
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
  
  console.log(`✅ SCHEDULE SUCCESS: Post ${post.id} scheduled for publication at ${scheduledTime.toISOString()}`);
  console.log(`🎯 ACTIVE JOBS COUNT: ${Object.keys(activeJobs).length}`);
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