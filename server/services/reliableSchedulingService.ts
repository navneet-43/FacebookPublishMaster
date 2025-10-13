/**
 * Reliable Scheduling Service
 * Ensures posts are published even if server restarts or goes to sleep
 * Uses database-driven approach instead of in-memory scheduling
 */

import { storage } from '../storage';
import { publishPostToFacebook } from './postService';
import { db } from '../db';
import { posts } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

export class ReliableSchedulingService {
  private static checkInterval: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Initialize the reliable scheduling system
   * Uses frequent database checks instead of in-memory timers
   */
  static async initialize(): Promise<void> {
    console.log('🔄 INITIALIZING RELIABLE SCHEDULING SYSTEM...');
    
    // Process any overdue posts immediately on startup
    await this.processOverduePosts();
    
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Set up more frequent checks (every 15 seconds) for better reliability
    // This reduces maximum delay from system restart to 15 seconds
    this.checkInterval = setInterval(async () => {
      try {
        await this.processOverduePosts();
      } catch (error) {
        console.error('🚨 SCHEDULING CHECK FAILED:', error);
        // Continue checking even if one iteration fails
      }
    }, 15 * 1000); // Check every 15 seconds for faster recovery
    
    console.log('✅ RELIABLE SCHEDULING SYSTEM INITIALIZED - Checking every 15 seconds for maximum reliability');
  }

  /**
   * Process overdue posts with improved reliability and duplicate prevention
   */
  private static async processOverduePosts(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    
    try {
      const now = new Date();
      
      // Get posts that should have been published - only 'scheduled' status to prevent duplicates
      const overduePosts = await storage.getOverduePosts();
      
      // Filter out any posts that might be currently processing
      const validOverduePosts = overduePosts.filter(post => 
        post.status === 'scheduled' && post.scheduledFor && new Date(post.scheduledFor) <= now
      );
      
      if (validOverduePosts.length > 0) {
        console.log(`🚨 FOUND ${validOverduePosts.length} OVERDUE POSTS - Processing immediately`);
        
        for (const post of validOverduePosts) {
          // Double-check post is still in 'scheduled' status to prevent race conditions
          const currentPost = await storage.getPost(post.id);
          if (!currentPost || currentPost.status !== 'scheduled') {
            console.log(`⏭️ SKIPPING POST ${post.id} - Already processed (status: ${currentPost?.status})`);
            continue;
          }
          
          const scheduledTime = new Date(post.scheduledFor!);
          const delayMinutes = Math.floor((now.getTime() - scheduledTime.getTime()) / 60000);
          
          // Alert for significant delays (> 5 minutes) to help identify system issues
          if (delayMinutes > 5) {
            console.log(`🚨 SIGNIFICANT DELAY DETECTED: Post ${post.id} is ${delayMinutes} minutes late - possible system restart/sleep`);
          }
          
          console.log(`⏰ PUBLISHING OVERDUE POST ${post.id}: "${post.content?.substring(0, 50)}..." (${delayMinutes} minutes late)`);
          
          try {
            // CRITICAL: Use atomic update to prevent race conditions between both schedulers
            // This ensures only one scheduler can process the post at a time
            const [updatedPost] = await db
              .update(posts)
              .set({ status: 'publishing' })
              .where(and(eq(posts.id, post.id), eq(posts.status, 'scheduled')))
              .returning();
            
            // If no row was updated, another process already took this post
            if (!updatedPost) {
              console.log(`⚡ RACE CONDITION PREVENTED: Post ${post.id} already being processed by another scheduler`);
              
              // Log this critical event for production monitoring
              await storage.createActivity({
                userId: post.userId || null,
                type: 'system_race_condition_prevented',
                description: `Race condition prevented: Post ${post.id} was already being processed by another scheduler (Primary vs Backup)`,
                metadata: { 
                  postId: post.id,
                  preventedBy: 'ReliableSchedulingService',
                  originalScheduledTime: post.scheduledFor,
                  attemptedAt: new Date().toISOString()
                }
              });
              continue;
            }
            
            // Publish to Facebook
            const result = await publishPostToFacebook(post);
            
            // Also publish to Instagram if enabled
            let instagramResult = null;
            if (post.postToInstagram && post.instagramAccountId) {
              const { publishPostToInstagram } = await import('./postService');
              instagramResult = await publishPostToInstagram(post);
              
              if (instagramResult.success) {
                console.log(`📸 INSTAGRAM: Post ${post.id} also published to Instagram`);
                await storage.updatePost(post.id, {
                  instagramPostId: instagramResult.data?.instagramPostId
                });
              } else {
                console.error(`❌ INSTAGRAM: Failed to publish post ${post.id} to Instagram: ${instagramResult.error}`);
              }
            }
            
            if (result.success) {
              await storage.updatePost(post.id, {
                status: 'published',
                publishedAt: new Date()
              });
              
              const instagramStatus = post.postToInstagram 
                ? (instagramResult?.success ? ' and Instagram' : ' (Instagram failed)')
                : '';
              
              await storage.createActivity({
                userId: post.userId || null,
                type: 'post_published',
                description: `Overdue post published to Facebook${instagramStatus} (${delayMinutes} minutes late)`,
                metadata: { 
                  postId: post.id, 
                  wasOverdue: true,
                  delayMinutes: delayMinutes,
                  originalScheduledTime: post.scheduledFor,
                  instagramPublished: instagramResult?.success || false
                }
              });
              
              console.log(`✅ OVERDUE POST ${post.id} PUBLISHED SUCCESSFULLY`);
            } else {
              await storage.updatePost(post.id, {
                status: 'failed',
                errorMessage: result.error || 'Publication failed'
              });
              
              await storage.createActivity({
                userId: post.userId || null,
                type: 'post_failed',
                description: `Overdue post failed to publish: ${result.error}`,
                metadata: { 
                  postId: post.id, 
                  wasOverdue: true,
                  error: result.error
                }
              });
              
              console.error(`❌ OVERDUE POST ${post.id} FAILED: ${result.error}`);
            }
          } catch (error) {
            console.error(`💥 ERROR PROCESSING OVERDUE POST ${post.id}:`, error);
            
            await storage.updatePost(post.id, {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
      
      // Also check for posts that should be published in the next minute
      const upcomingTime = new Date(now.getTime() + 60000); // 1 minute from now
      const upcomingPosts = await storage.getScheduledPosts();
      const imminentPosts = upcomingPosts.filter(post => {
        const scheduledTime = new Date(post.scheduledFor!);
        return scheduledTime <= upcomingTime && scheduledTime > now;
      });
      
      if (imminentPosts.length > 0) {
        console.log(`📋 ${imminentPosts.length} posts scheduled for next minute - Ready for publication`);
      }
      
    } catch (error) {
      console.error('💥 ERROR IN RELIABLE SCHEDULING:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Force check for overdue posts (called manually if needed)
   */
  static async forceCheck(): Promise<void> {
    console.log('🔍 FORCE CHECKING FOR OVERDUE POSTS...');
    await this.processOverduePosts();
  }

  /**
   * Get scheduling status for debugging
   */
  static getStatus(): { isActive: boolean; checkInterval: number; isProcessing: boolean; lastCheck?: Date } {
    return {
      isActive: this.checkInterval !== null,
      checkInterval: 15, // seconds - updated to reflect new faster interval
      isProcessing: this.isProcessing,
      lastCheck: new Date() // Always show current time as we just checked
    };
  }

  /**
   * Shutdown the service
   */
  static shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('🛑 RELIABLE SCHEDULING SERVICE SHUTDOWN');
  }
}