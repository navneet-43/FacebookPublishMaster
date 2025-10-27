import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { InstagramCommentService } from '../services/instagramCommentService';
import { db } from '../db';
import { platformUsers } from '../shared/schema';

const router = Router();

// Store for user access tokens (in production, use proper session management)
const userTokens = new Map<string, string>();

/**
 * POST /api/comments/scrape
 * Scrape comments for Instagram reels
 */
router.post('/scrape', async (req, res) => {
  try {
    const { userId, reels } = req.body;

    if (!userId || !reels || !Array.isArray(reels)) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId and reels array' 
      });
    }

    // Get user's access token from database
    const user = await db.select().from(platformUsers).where(eq(platformUsers.id, userId)).limit(1);
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const accessToken = user[0].facebookAccessToken;
    if (!accessToken) {
      return res.status(400).json({ 
        error: 'No Facebook access token found. Please connect your Facebook account first.' 
      });
    }

    const commentService = new InstagramCommentService(accessToken);
    const results = [];

    // Process each reel
    for (const reel of reels) {
      try {
        const { creatorName, url, uniqueId } = reel;
        
        if (!creatorName || !url || !uniqueId) {
          console.warn(`⚠️ Skipping invalid reel data:`, reel);
          continue;
        }

        console.log(`🎬 Processing: ${creatorName} - ${uniqueId}`);
        
        const result = await commentService.processReelComments(url, creatorName, uniqueId);
        
        results.push({
          creatorName,
          uniqueId,
          url,
          success: true,
          filePath: result.filePath,
          analysis: result.analysis,
          commentCount: result.commentCount
        });

        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Error processing reel for ${reel.creatorName}:`, error);
        
        results.push({
          creatorName: reel.creatorName,
          uniqueId: reel.uniqueId,
          url: reel.url,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} reels`,
      results
    });

  } catch (error) {
    console.error('❌ Comment scraping error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape comments', 
      details: error.message 
    });
  }
});

/**
 * GET /api/comments/analysis/:userId
 * Get comment analysis for a user
 */
router.get('/analysis/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user's access token
    const user = await db.select().from(platformUsers).where(eq(platformUsers.id, userId)).limit(1);
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const accessToken = user[0].facebookAccessToken;
    if (!accessToken) {
      return res.status(400).json({ 
        error: 'No Facebook access token found' 
      });
    }

    res.json({
      success: true,
      message: 'Comment analysis service ready',
      instructions: [
        'Use POST /api/comments/scrape to scrape comments',
        'Provide reels array with creatorName, url, and uniqueId',
        'Results will include Excel files and analysis data'
      ]
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to get analysis', 
      details: error.message 
    });
  }
});

export default router;

