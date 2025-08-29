import schedule from 'node-schedule';
import { storage } from '../storage';
import { Post, posts } from '@shared/schema';
import fetch from 'node-fetch';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';

// Store active job schedules by post ID
const activeJobs: Record<number, schedule.Job> = {};

/**
 * Publish a post to Facebook using Hootsuite-style approach
 * @param post The post to publish
 * @returns Result of the operation
 */
export async function publishPostToFacebook(post: Post): Promise<{success: boolean, data?: any, error?: string}> {
  // Import services at function level for error handler access
  const { progressTracker } = await import('./progressTrackingService');
  
  try {
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
    // Initialize progress tracking if uploadId is provided
    if ((post as any).uploadId && post.userId) {
      console.log(`📊 Initializing progress tracking for upload: ${(post as any).uploadId}`);
      progressTracker.startUpload((post as any).uploadId, post.userId);
      progressTracker.updateProgress((post as any).uploadId, 'Starting Facebook publish process...', 5, 'Validating account and preparing upload');
    }
    
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
    
    // Update progress
    if ((post as any).uploadId) {
      progressTracker.updateProgress((post as any).uploadId, 'Validating Facebook authentication...', 10, 'Checking page access token');
    }
    
    // Validate token before using it
    const isValidToken = await HootsuiteStyleFacebookService.validatePageToken(account.pageId, account.accessToken);
    if (!isValidToken) {
      console.log('Invalid page token detected, attempting refresh...');
      if ((post as any).uploadId) {
        progressTracker.completeUpload((post as any).uploadId, false, 'Facebook access token is invalid or expired');
      }
      return { 
        success: false, 
        error: 'Facebook access token is invalid or expired. Please refresh your Facebook connection.' 
      };
    }
    
    console.log(`Publishing post ${post.id} to Facebook page: ${account.name} (${account.pageId})`);
    console.log(`📝 Post mediaType: "${post.mediaType}" | mediaUrl: ${post.mediaUrl ? 'present' : 'none'}`);
    
    // Update progress
    if ((post as any).uploadId) {
      progressTracker.updateProgress((post as any).uploadId, 'Processing custom labels...', 15, 'Resolving label IDs to names');
    }
    
    // Resolve label IDs to label names if labels are provided as IDs
    let resolvedLabels = post.labels;
    if (post.labels && post.labels.length > 0 && post.userId) {
      const labelNames = [];
      for (const label of post.labels) {
        // Check if label is an ID (number as string) or already a name
        if (/^\d+$/.test(label)) {
          // It's an ID, resolve to name
          try {
            const customLabels = await storage.getCustomLabels(post.userId);
            const labelObj = customLabels.find(l => l.id.toString() === label);
            if (labelObj) {
              labelNames.push(labelObj.name);
            } else {
              labelNames.push(label); // Keep original if not found
            }
          } catch (error) {
            console.warn(`Failed to resolve label ID ${label}:`, error);
            labelNames.push(label); // Keep original on error
          }
        } else {
          // It's already a name
          labelNames.push(label);
        }
      }
      resolvedLabels = labelNames;
      console.log('Resolved labels:', post.labels, '->', resolvedLabels);
    }
    
    let result;
    
    // Determine post type based on mediaType and publish accordingly
    if (post.mediaUrl && post.mediaType && post.mediaType !== 'none') {
      switch (post.mediaType) {
        case 'photo':
        case 'image':
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Publishing photo to Facebook...', 30, 'Uploading image content');
          }
          // Use simple photo service to avoid import issues
          const { SimpleFacebookPhotoService } = await import('./simpleFacebookPhotoService');
          result = await SimpleFacebookPhotoService.uploadPhoto(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            resolvedLabels || undefined,
            post.language || undefined
          );
          break;
          
        case 'video':
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Processing video for Facebook upload...', 25, 'Starting video processing and upload');
          }
          result = await HootsuiteStyleFacebookService.publishVideoPost(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            resolvedLabels || undefined,
            post.language || undefined,
            (post as any).uploadId // Pass uploadId for progress tracking
          );
          break;
          
        case 'reel':
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Processing Reel for Facebook upload...', 25, 'Starting Reel processing and upload');
          }
          result = await HootsuiteStyleFacebookService.publishReelPost(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            resolvedLabels || undefined,
            post.language || undefined,
            (post as any).uploadId // Pass uploadId for progress tracking
          );
          break;
          
        default:
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Publishing content to Facebook...', 30, 'Processing text with media link');
          }
          // Fallback to text post with media as link
          result = await HootsuiteStyleFacebookService.publishTextPost(
            account.pageId,
            account.accessToken,
            post.content || 'Check out this content!',
            post.mediaUrl,
            resolvedLabels || undefined,
            post.language || undefined
          );
      }
    } else {
      // Text-only post
      if ((post as any).uploadId) {
        progressTracker.updateProgress((post as any).uploadId, 'Publishing text post to Facebook...', 30, 'Processing text content');
      }
      result = await HootsuiteStyleFacebookService.publishTextPost(
        account.pageId,
        account.accessToken,
        post.content!,
        post.link || undefined,
        resolvedLabels || undefined,
        post.language || undefined
      );
    }
    
    if (result.success) {
      // Complete progress tracking
      if ((post as any).uploadId) {
        progressTracker.completeUpload((post as any).uploadId, true, 'Video uploaded and published to Facebook successfully');
      }
      
      // Log activity for successful publication
      const languageInfo = post.language ? ` (${post.language.toUpperCase()})` : '';
      const labelsInfo = resolvedLabels && resolvedLabels.length > 0 ? ` with labels: ${resolvedLabels.join(', ')}` : '';
      
      await storage.createActivity({
        userId: post.userId || null,
        type: 'post_published',
        description: `Post published to Facebook page: ${account.name}${languageInfo}${labelsInfo}`,
        metadata: { 
          postId: post.id,
          facebookPostId: result.postId,
          pageId: account.pageId,
          customLabels: resolvedLabels,
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
      // Complete progress tracking for failed upload
      if ((post as any).uploadId) {
        progressTracker.completeUpload((post as any).uploadId, false, result.error || 'Facebook publishing failed');
      }
      
      console.error(`Failed to publish post ${post.id} to Facebook:`, result.error);
      return { 
        success: false, 
        error: result.error || 'Unknown Facebook publishing error'
      };
    }
    
  } catch (error) {
    // Complete progress tracking for error
    if ((post as any).uploadId) {
      progressTracker.completeUpload((post as any).uploadId, false, error instanceof Error ? error.message : 'Unknown error occurred');
    }
    
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
      console.log(`🚀 IST TIME: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
      
      // CRITICAL: Use atomic update to prevent race conditions with ReliableSchedulingService
      // This ensures only one scheduler can process the post at a time
      const [updatedPost] = await db
        .update(posts)
        .set({ status: 'publishing' })
        .where(and(eq(posts.id, post.id), eq(posts.status, 'scheduled')))
        .returning();
      
      // If no row was updated, another process already took this post
      if (!updatedPost) {
        console.log(`⚡ RACE CONDITION PREVENTED: Post ${post.id} already being processed by ReliableSchedulingService`);
        
        // Log this critical event for production monitoring
        await storage.createActivity({
          userId: post.userId || null,
          type: 'system_race_condition_prevented',
          description: `Race condition prevented: Post ${post.id} was already being processed by ReliableSchedulingService (Primary vs Backup)`,
          metadata: { 
            postId: post.id,
            preventedBy: 'PrimaryScheduler',
            originalScheduledTime: post.scheduledFor,
            attemptedAt: new Date().toISOString()
          }
        });
        return;
      }
      
      const currentPost = updatedPost;
      
      console.log(`📝 PUBLISHING POST: "${currentPost.content}" to Facebook...`);
      
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
    console.log('Initializing scheduled posts system...');
    
    // First, process any overdue posts that should have already been published
    await processOverduePosts();
    
    // Get all scheduled posts
    const scheduledPosts = await storage.getScheduledPosts();
    let scheduledCount = 0;
    
    // Schedule each post
    for (const post of scheduledPosts) {
      schedulePostPublication(post);
      scheduledCount++;
    }
    
    console.log(`Initialized ${scheduledCount} scheduled posts`);
    
    // Set up periodic check for overdue posts every 2 minutes
    setInterval(async () => {
      await processOverduePosts();
    }, 2 * 60 * 1000);
    
  } catch (error) {
    console.error("Error initializing scheduled posts:", error);
  }
}

/**
 * Process posts that should have already been published but are still scheduled
 */
async function processOverduePosts(): Promise<void> {
  try {
    const now = new Date();
    console.log(`🔍 CHECKING OVERDUE POSTS at ${now.toISOString()}`);
    
    // Get posts that are scheduled but past their scheduled time
    const overduePosts = await storage.getOverduePosts();
    
    if (overduePosts.length > 0) {
      console.log(`📋 Found ${overduePosts.length} overdue posts to publish immediately`);
      
      for (const post of overduePosts) {
        console.log(`⏰ PUBLISHING OVERDUE POST: ${post.id} (was scheduled for ${post.scheduledFor})`);
        console.log(`⏰ Content: "${post.content}"`);
        
        try {
          const result = await publishPostToFacebook(post);
          
          if (result.success) {
            await storage.updatePost(post.id, {
              status: 'published',
              publishedAt: new Date()
            });
            
            await storage.createActivity({
              userId: post.userId || null,
              type: 'post_published',
              description: `Overdue post published to Facebook`,
              metadata: { postId: post.id, wasOverdue: true }
            });
            
            console.log(`✅ Successfully published overdue post ${post.id}`);
          } else {
            await storage.updatePost(post.id, {
              status: 'failed',
              errorMessage: result.error || 'Failed to publish overdue post'
            });
            
            console.error(`❌ Failed to publish overdue post ${post.id}:`, result.error);
          }
        } catch (error) {
          console.error(`❌ Error publishing overdue post ${post.id}:`, error);
          
          try {
            await storage.updatePost(post.id, {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
          } catch (updateError) {
            console.error(`Error updating failed post ${post.id}:`, updateError);
          }
        }
      }
    } else {
      console.log(`✅ No overdue posts found`);
    }
  } catch (error) {
    console.error('Error processing overdue posts:', error);
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