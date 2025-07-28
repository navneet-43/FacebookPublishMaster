/**
 * Scheduling Status API Routes
 * Provides debugging information about the scheduling system
 */

import { Router } from 'express';
// Use the same auth pattern as other routes
const requireAuth = async (req: any, res: any, next: any) => {
  // Use default Facebook OAuth user (ID 3) without authentication
  req.user = { id: 3 };
  next();
};
import { ReliableSchedulingService } from '../services/reliableSchedulingService';
import { storage } from '../storage';

const router = Router();

/**
 * Get scheduling system status and overdue posts count
 */
router.get('/api/scheduling-status', requireAuth, async (req, res) => {
  try {
    const status = ReliableSchedulingService.getStatus();
    const overduePosts = await storage.getOverduePosts();
    const scheduledPosts = await storage.getScheduledPosts();
    
    res.json({
      system: status,
      overduePosts: overduePosts.length,
      scheduledPosts: scheduledPosts.length,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Force check for overdue posts (manual trigger)
 */
router.post('/api/force-check-posts', requireAuth, async (req, res) => {
  try {
    await ReliableSchedulingService.forceCheck();
    
    const overduePosts = await storage.getOverduePosts();
    
    res.json({
      success: true,
      message: 'Manual check completed',
      overduePosts: overduePosts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;