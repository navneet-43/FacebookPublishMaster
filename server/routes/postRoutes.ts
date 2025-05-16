import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { postService } from '../services/postService';
import { insertPostSchema } from '../../shared/schema';
import { z } from 'zod';

const router = Router();

/**
 * Get all posts for the authenticated user
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const posts = await req.storage.getPosts(userId);
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching posts', 
      error: (error as Error).message 
    });
  }
});

/**
 * Get upcoming scheduled posts
 */
router.get('/upcoming', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const upcomingPosts = await postService.getUpcomingPosts(userId, days);
    res.json(upcomingPosts);
  } catch (error) {
    console.error('Error fetching upcoming posts:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching upcoming posts', 
      error: (error as Error).message 
    });
  }
});

/**
 * Get a single post by ID
 */
router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const postId = parseInt(req.params.id);
    
    if (isNaN(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }
    
    const post = await req.storage.getPost(postId);
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    
    // Check authorization
    if (post.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this post' });
    }
    
    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching post', 
      error: (error as Error).message 
    });
  }
});

/**
 * Create a new post
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    
    // Parse and validate input
    const postData = {
      ...req.body,
      userId
    };
    
    // Validate with Zod
    try {
      insertPostSchema.parse(postData);
    } catch (validationError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        error: (validationError as z.ZodError).format() 
      });
    }
    
    // Create post using service
    const newPost = await postService.createPost(postData);
    
    res.status(201).json({ 
      success: true, 
      message: 'Post created successfully', 
      post: newPost 
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating post', 
      error: (error as Error).message 
    });
  }
});

/**
 * Update an existing post
 */
router.put('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const postId = parseInt(req.params.id);
    
    if (isNaN(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }
    
    // Update post using service
    const updatedPost = await postService.updatePost(postId, userId, req.body);
    
    res.json({ 
      success: true, 
      message: 'Post updated successfully', 
      post: updatedPost 
    });
  } catch (error) {
    console.error('Error updating post:', error);
    
    // Handle specific errors with appropriate status codes
    if ((error as Error).message === 'Post not found') {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }
    
    if ((error as Error).message === 'Not authorized to update this post') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this post' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error updating post', 
      error: (error as Error).message 
    });
  }
});

/**
 * Delete a post
 */
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const postId = parseInt(req.params.id);
    
    if (isNaN(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }
    
    // Delete post using service
    await postService.deletePost(postId, userId);
    
    res.json({ 
      success: true, 
      message: 'Post deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    
    // Handle specific errors with appropriate status codes
    if ((error as Error).message === 'Post not found') {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }
    
    if ((error as Error).message === 'Not authorized to delete this post') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this post' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting post', 
      error: (error as Error).message 
    });
  }
});

/**
 * Publish a post immediately
 */
router.post('/:id/publish', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const postId = parseInt(req.params.id);
    
    if (isNaN(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }
    
    // Get the post
    const post = await req.storage.getPost(postId);
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    
    // Check authorization
    if (post.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to publish this post' });
    }
    
    // Publish the post
    const success = await postService.publishPostToFacebook(post);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Post published successfully' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to publish post' 
      });
    }
  } catch (error) {
    console.error('Error publishing post:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error publishing post', 
      error: (error as Error).message 
    });
  }
});

/**
 * Retry failed posts
 */
router.post('/retry-failed', isAuthenticated, async (req: Request, res: Response) => {
  try {
    await postService.retryFailedPosts();
    res.json({ 
      success: true, 
      message: 'Retry process initiated for failed posts' 
    });
  } catch (error) {
    console.error('Error retrying failed posts:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrying failed posts', 
      error: (error as Error).message 
    });
  }
});

export default router;