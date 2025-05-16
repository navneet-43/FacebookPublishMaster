import { storage } from "../storage";
import { InsertPost, Post } from "../../shared/schema";
import { z } from "zod";
import schedule from "node-schedule";
import fetch from "node-fetch";
import { User } from "../../shared/schema";

// Keep track of scheduled jobs
const scheduledJobs = new Map<string, schedule.Job>();

// Post validation schema
export const postValidationSchema = z.object({
  userId: z.number().positive(),
  accountId: z.number().positive(),
  content: z.string().min(1, "Content is required").max(5000, "Content cannot exceed 5000 characters"),
  mediaUrl: z.string().nullable().optional(),
  link: z.string().url("Please enter a valid URL").nullable().optional(),
  labels: z.array(z.string()).nullable().optional(),
  language: z.string().optional(),
  scheduledFor: z.string().transform(str => new Date(str)).optional(),
  status: z.enum(["draft", "scheduled", "published", "failed"]).default("draft"),
  asanaTaskId: z.string().nullable().optional(),
});

/**
 * Creates a new post with validation
 */
export async function createPost(postData: InsertPost): Promise<Post> {
  // Validate post data
  const validatedData = postValidationSchema.parse(postData);
  
  // Check if the Facebook account exists and is active
  const account = await storage.getFacebookAccount(validatedData.accountId as number);
  if (!account) {
    throw new Error("Facebook account not found");
  }
  
  if (!account.isActive) {
    throw new Error("Facebook account is not active");
  }
  
  // If status is scheduled, make sure scheduledFor is in the future
  if (validatedData.status === "scheduled" && validatedData.scheduledFor) {
    const scheduledDate = new Date(validatedData.scheduledFor);
    const now = new Date();
    
    if (scheduledDate <= now) {
      throw new Error("Scheduled date must be in the future");
    }
  }
  
  // Create the post in the database
  const post = await storage.createPost(validatedData as InsertPost);
  
  // If status is scheduled, schedule the job
  if (post.status === "scheduled" && post.scheduledFor) {
    schedulePostPublication(post);
  }
  
  // Create activity log
  await storage.createActivity({
    userId: post.userId as number,
    type: "post_created",
    description: post.status === "scheduled" ? "Post scheduled" : "Post created",
    metadata: { postId: post.id }
  });
  
  return post;
}

/**
 * Updates an existing post
 */
export async function updatePost(id: number, userId: number, updateData: Partial<Post>): Promise<Post | undefined> {
  // Get existing post
  const existingPost = await storage.getPost(id);
  if (!existingPost) {
    throw new Error("Post not found");
  }
  
  // Check authorization
  if (existingPost.userId !== userId) {
    throw new Error("Not authorized to update this post");
  }
  
  // Validate update data
  const validatedData = postValidationSchema.partial().parse(updateData);
  
  // Handle scheduling changes
  if (validatedData.scheduledFor || validatedData.status) {
    const newStatus = validatedData.status || existingPost.status;
    const newScheduledFor = validatedData.scheduledFor 
      ? new Date(validatedData.scheduledFor) 
      : existingPost.scheduledFor;
    
    // Cancel existing scheduled job if it exists
    if (scheduledJobs.has(id.toString())) {
      const job = scheduledJobs.get(id.toString());
      job?.cancel();
      scheduledJobs.delete(id.toString());
    }
    
    // If post is still scheduled, create new job
    if (newStatus === "scheduled" && newScheduledFor) {
      const now = new Date();
      if (newScheduledFor <= now) {
        throw new Error("Scheduled date must be in the future");
      }
      
      // We'll schedule the job after updating the post
    }
  }
  
  // Update the post in the database
  const updatedPost = await storage.updatePost(id, validatedData as Partial<Post>);
  
  // Schedule new job if needed
  if (updatedPost && updatedPost.status === "scheduled" && updatedPost.scheduledFor) {
    schedulePostPublication(updatedPost);
  }
  
  // Create activity log
  if (updatedPost) {
    await storage.createActivity({
      userId,
      type: "post_updated",
      description: "Post updated",
      metadata: { postId: id }
    });
  }
  
  return updatedPost;
}

/**
 * Deletes a post and cancels any scheduled publication
 */
export async function deletePost(id: number, userId: number): Promise<boolean> {
  // Get existing post
  const existingPost = await storage.getPost(id);
  if (!existingPost) {
    throw new Error("Post not found");
  }
  
  // Check authorization
  if (existingPost.userId !== userId) {
    throw new Error("Not authorized to delete this post");
  }
  
  // Cancel scheduled job if it exists
  if (scheduledJobs.has(id.toString())) {
    const job = scheduledJobs.get(id.toString());
    job?.cancel();
    scheduledJobs.delete(id.toString());
  }
  
  // Delete the post
  const result = await storage.deletePost(id);
  
  // Create activity log if successful
  if (result) {
    await storage.createActivity({
      userId,
      type: "post_deleted",
      description: "Post deleted",
      metadata: { postId: id }
    });
  }
  
  return result;
}

/**
 * Publishes a post to Facebook
 */
export async function publishPostToFacebook(post: Post): Promise<boolean> {
  try {
    // Get the Facebook account
    const account = await storage.getFacebookAccount(post.accountId as number);
    if (!account || !account.isActive) {
      throw new Error("Facebook account not found or inactive");
    }
    
    // Prepare post data
    const postData: any = {
      message: post.content,
    };
    
    // Add link if provided
    if (post.link) {
      postData.link = post.link;
    }
    
    // Different endpoints based on media type
    let endpoint = `https://graph.facebook.com/v18.0/${account.pageId}/feed`;
    let result;
    
    // If there's media, handle it differently
    if (post.mediaUrl) {
      if (post.mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i)) {
        // It's an image
        endpoint = `https://graph.facebook.com/v18.0/${account.pageId}/photos`;
        postData.url = post.mediaUrl;
      } else if (post.mediaUrl.match(/\.(mp4|mov|wmv|avi)$/i)) {
        // It's a video
        endpoint = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;
        postData.file_url = post.mediaUrl;
      }
    }
    
    // Make the API request to Facebook
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...postData,
        access_token: account.accessToken,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Facebook API error: ${data.error?.message || 'Unknown error'}`);
    }
    
    // Update post status to published
    await storage.updatePost(post.id, {
      status: "published",
      publishedAt: new Date(),
    });
    
    // Create activity log
    await storage.createActivity({
      userId: post.userId as number,
      type: "post_published",
      description: `Post published to ${account.name}`,
      metadata: { postId: post.id, facebookPostId: data.id }
    });
    
    return true;
  } catch (error) {
    console.error(`Error publishing post ${post.id}:`, error);
    
    // Update post with error
    await storage.updatePost(post.id, { 
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Failed to publish post"
    });
    
    // Log activity
    await storage.createActivity({
      userId: post.userId as number,
      type: "post_failed",
      description: "Failed to publish post",
      metadata: { postId: post.id, error: error instanceof Error ? error.message : "Unknown error" }
    });
    
    return false;
  }
}

/**
 * Schedule a post for publication
 */
function schedulePostPublication(post: Post): void {
  if (!post.scheduledFor || post.status !== "scheduled") {
    return;
  }
  
  // Calculate the scheduled time
  const scheduledTime = new Date(post.scheduledFor);
  const now = new Date();
  
  // Ensure the scheduled time is in the future
  if (scheduledTime <= now) {
    console.warn(`Post ${post.id} scheduled time is in the past, publishing immediately`);
    // Publish immediately
    publishPostToFacebook(post);
    return;
  }
  
  // Schedule the job
  const job = schedule.scheduleJob(scheduledTime, async () => {
    try {
      // Get the latest post data to ensure it hasn't been canceled or changed
      const latestPost = await storage.getPost(post.id);
      if (!latestPost || latestPost.status !== "scheduled") {
        // Post has been deleted or status changed
        return;
      }
      
      // Publish the post
      await publishPostToFacebook(latestPost);
    } catch (error) {
      console.error(`Error publishing scheduled post ${post.id}:`, error);
    } finally {
      // Remove the job from the map
      scheduledJobs.delete(post.id.toString());
    }
  });
  
  // Store the job in the map
  scheduledJobs.set(post.id.toString(), job);
  
  console.log(`Post ${post.id} scheduled for publication at ${scheduledTime.toISOString()}`);
}

/**
 * Initialize scheduling for all scheduled posts
 * Call this when the server starts
 */
export async function initializeScheduledPosts(): Promise<void> {
  try {
    // Since we don't have a getUsers function, we'll look for scheduled posts directly
    const posts = await storage.getAllPosts();
    let scheduledCount = 0;
    
    // Filter scheduled posts
    const scheduledPosts = posts.filter(post => 
      post.status === "scheduled" && post.scheduledFor && new Date(post.scheduledFor) > new Date()
    );
    
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
    // Get all posts
    const posts = await storage.getAllPosts();
    let retriedCount = 0;
    
    // Filter for failed posts
    const failedPosts = posts.filter(post => post.status === "failed");
    
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
 * Get upcoming posts for the next N days
 */
export async function getUpcomingPosts(userId: number, days: number = 7): Promise<Post[]> {
  try {
    const posts = await storage.getPosts(userId);
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    return posts.filter(post => 
      post.status === "scheduled" && 
      post.scheduledFor && 
      new Date(post.scheduledFor) >= now &&
      new Date(post.scheduledFor) <= endDate
    ).sort((a, b) => {
      const aDate = a.scheduledFor ? new Date(a.scheduledFor) : new Date(0);
      const bDate = b.scheduledFor ? new Date(b.scheduledFor) : new Date(0);
      return aDate.getTime() - bDate.getTime();
    });
  } catch (error) {
    console.error("Error getting upcoming posts:", error);
    return [];
  }
}

/**
 * Add all available methods to make them importable
 */
export const postService = {
  createPost,
  updatePost,
  deletePost,
  publishPostToFacebook,
  initializeScheduledPosts,
  retryFailedPosts,
  getUpcomingPosts
};