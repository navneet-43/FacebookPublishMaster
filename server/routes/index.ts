import { Router } from 'express';
import postRoutes from './postRoutes';
import commentScraperRoutes from './commentScraper';

const router = Router();

// Register all routes
router.use('/posts', postRoutes);
router.use('/comments', commentScraperRoutes);

export default router;