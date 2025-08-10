import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Get posts for reporting with detailed information
router.get('/posts', async (req, res) => {
  try {
    const userId = (req.session as any)?.userId || 3; // Default user for testing
    const { 
      dateRange, 
      status, 
      account, 
      contentBucket, 
      search 
    } = req.query;

    console.log('📊 Fetching posts for reports with filters:', {
      userId,
      dateRange,
      status,
      account,
      contentBucket,
      search
    });

    // Get all posts for the user
    const posts = await storage.getAllPosts(userId);
    
    // Get Facebook accounts to map account IDs to names
    const accounts = await storage.getFacebookAccounts(userId);
    const accountMap = new Map(accounts.map(acc => [acc.id, acc]));

    // Get activities to find published information
    const activities = await storage.getActivities(userId);
    const publishedActivities = activities.filter(activity => 
      activity.type === 'post_published' && 
      activity.metadata?.postId &&
      activity.metadata?.facebookPostId
    );

    // Create a map of post ID to published activity
    const publishedMap = new Map();
    publishedActivities.forEach(activity => {
      const postId = activity.metadata?.postId;
      if (postId && !publishedMap.has(postId)) {
        publishedMap.set(postId, activity);
      }
    });

    // Transform posts to include report data
    let reportPosts = posts.map(post => {
      const account = accountMap.get(post.accountId);
      const publishedActivity = publishedMap.get(post.id);
      
      return {
        id: post.id,
        content: post.content || '',
        createdAt: post.createdAt,
        publishedAt: publishedActivity?.createdAt || post.publishedAt,
        status: post.status,
        errorMessage: post.errorMessage,
        labels: post.labels || [],
        language: post.language || 'EN',
        mediaType: post.mediaType,
        accountName: account?.name || 'Unknown Account',
        pageId: account?.pageId || '',
        facebookPostId: publishedActivity?.metadata?.facebookPostId || null
      };
    });

    // Apply filters
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      reportPosts = reportPosts.filter(post => 
        new Date(post.createdAt) >= startDate
      );
    }

    if (status && status !== 'all') {
      reportPosts = reportPosts.filter(post => post.status === status);
    }

    if (account && account !== 'all') {
      const accountId = parseInt(account as string);
      reportPosts = reportPosts.filter(post => 
        accountMap.get(post.id)?.id === accountId
      );
    }

    if (contentBucket && contentBucket !== 'all') {
      reportPosts = reportPosts.filter(post => 
        post.labels.includes(contentBucket as string)
      );
    }

    if (search) {
      const searchTerm = (search as string).toLowerCase();
      reportPosts = reportPosts.filter(post => 
        post.content.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by creation date (newest first)
    reportPosts.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    console.log(`📊 Returning ${reportPosts.length} posts for reports`);
    res.json(reportPosts);

  } catch (error) {
    console.error('❌ Error fetching posts for reports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch posts for reports',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get summary statistics for reports
router.get('/stats', async (req, res) => {
  try {
    const userId = (req.session as any)?.userId || 3;
    
    // Get posts and activities
    const posts = await storage.getAllPosts(userId);
    const activities = await storage.getActivities(userId);
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate stats
    const stats = {
      total: posts.length,
      published: posts.filter(p => p.status === 'published').length,
      failed: posts.filter(p => p.status === 'failed').length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
      today: posts.filter(p => new Date(p.createdAt) >= today).length,
      thisWeek: posts.filter(p => new Date(p.createdAt) >= thisWeek).length,
      thisMonth: posts.filter(p => new Date(p.createdAt) >= thisMonth).length,
      publishedToday: activities.filter(a => 
        a.type === 'post_published' && 
        new Date(a.createdAt) >= today
      ).length
    };

    res.json(stats);

  } catch (error) {
    console.error('❌ Error fetching report stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch report statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as reportsRouter };