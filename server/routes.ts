import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcrypt";
import {
  insertUserSchema,
  insertFacebookAccountSchema,
  insertGoogleSheetsIntegrationSchema,
  insertCustomLabelSchema,
  insertPostSchema,
  insertActivitySchema,
  FacebookAccount
} from "../shared/schema";
import schedule from "node-schedule";
import multer from "multer";
import { uploadImage } from "./utils/cloudinary";
import passport from "passport";
import { isAuthenticated, fetchUserPages } from "./auth";
import platformAuthRouter, { requireAuth as requirePlatformAuth } from "./routes/platformAuth";
import { GoogleSheetsService } from "./services/googleSheetsService";
import { setupGoogleOAuthRoutes } from "./routes/googleOAuth";
import { ExcelImportService } from "./services/excelImportService";
import { progressTracker } from "./services/progressTrackingService";
import { reportsRouter } from "./routes/reports";
import { seedDefaultAdmin } from "./seed";

const authenticateUser = async (req: Request) => {
  // Get authenticated user from session
  if (req.session && (req.session as any).userId) {
    return { id: (req.session as any).userId };
  }
  
  // Return null if no authenticated user
  return null;
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit for Excel/CSV files
    },
    fileFilter: (_req, file, cb) => {
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
        'application/csv'
      ];
      if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
      }
    }
  });
  
  app.use((req: any, res, next) => {
    req.storage = storage;
    next();
  });

  // Setup new platform authentication routes (uses main session from server/index.ts)
  app.use('/api/platform/auth', platformAuthRouter);
  // Add alias for Replit environment URL rewrite
  app.use('/api/client/auth', platformAuthRouter);
  
  // Setup Google OAuth routes
  setupGoogleOAuthRoutes(app);
  
  // Facebook authentication routes
  app.get('/auth/facebook', 
    passport.authenticate('facebook', { 
      scope: [
        'email', 
        'pages_show_list', 
        'pages_manage_posts', 
        'pages_read_engagement',
        'pages_manage_metadata',
        'business_management',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_insights'
      ]
    })
  );
  
  app.get('/auth/facebook/callback', 
    passport.authenticate('facebook', { failureRedirect: '/login' }),
    (req, res) => {
      res.redirect('/');
    }
  );

  // Manual seed endpoint for production (no auth required for initial setup)
  app.post('/api/admin/seed', async (req: Request, res: Response) => {
    try {
      const result = await seedDefaultAdmin();
      res.json({ 
        message: "Admin credentials synced successfully",
        ...result
      });
    } catch (error) {
      console.error("Manual seed error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to seed admin credentials",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // User authentication routes (platform users - email/password)
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    
    try {
      // Find platform user by email
      const user = await storage.getPlatformUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Update last login
      await storage.updatePlatformUserLastLogin(user.id);
      
      // Set session variables to match what the platform auth status expects
      (req.session as any).userId = user.id;
      (req.session as any).user = {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      };
      
      // Explicitly save the session before responding
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        
        res.json({ 
          message: "Login successful", 
          user: { 
            id: user.id, 
            username: user.username, 
            email: user.email,
            fullName: user.fullName,
            role: user.role
          } 
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid user data", errors: result.error.format() });
      }
      
      const existingUser = await storage.getUserByUsername(result.data.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const user = await storage.createUser(result.data);
      (req.session as any).userId = user.id;
      
      res.status(201).json({ 
        message: "Registration successful", 
        user: { id: user.id, username: user.username } 
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  app.get('/api/auth/status', (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    
    if (userId) {
      storage.getUser(userId).then(user => {
        if (user) {
          res.json({ 
            isLoggedIn: true, 
            user: { id: user.id, username: user.username } 
          });
        } else {
          res.json({ isLoggedIn: false });
        }
      }).catch(() => {
        res.json({ isLoggedIn: false });
      });
    } else {
      res.json({ isLoggedIn: false });
    }
  });

  app.get('/api/auth/logout', (req: Request, res: Response) => {
    req.session?.destroy(() => {
      res.json({ message: "Logout successful" });
    });
  });

  // Posts route - FIXED THREE ACTION SYSTEM
  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      console.log(`🎯 POST /api/posts - Status: "${req.body.status}"`);
      console.log('🔍 Request body:', JSON.stringify(req.body, null, 2));
      
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const result = insertPostSchema.safeParse(req.body);
      if (!result.success) {
        console.log('❌ VALIDATION FAILED:', JSON.stringify(result.error.format(), null, 2));
        return res.status(400).json({ message: "Invalid post data", errors: result.error.format() });
      }
      
      // Handle three different actions based on status
      if (result.data.status === "immediate") {
        // PUBLISH NOW - Publish immediately to selected platform
        const platform = result.data.platform || 'facebook';
        console.log(`🚀 PUBLISH NOW: Publishing immediately to ${platform.toUpperCase()}`);
        
        try {
          // Import deployment configuration
          const { deploymentConfig } = await import('./config/deploymentConfig');
          
          // Set longer timeout for large video uploads (30 minutes)
          req.setTimeout(deploymentConfig.REQUEST_TIMEOUT);
          res.setTimeout(deploymentConfig.RESPONSE_TIMEOUT);
          
          // Use uploadId from request or generate new one
          const uploadId = req.body.uploadId || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          console.log(`🔍 Using upload tracking ID: ${uploadId} with extended timeout (deployment: ${deploymentConfig.isDeployment()})`);
          
          const { publishPostToFacebook, publishPostToInstagram } = await import('./services/postService');
          
          let publishResult;
          let platformName;
          
          if (platform === 'instagram') {
            // Publish to Instagram
            if (!result.data.instagramAccountId) {
              return res.status(400).json({ message: "No Instagram account selected" });
            }
            
            const instagramAccountId = typeof result.data.instagramAccountId === 'number' 
              ? result.data.instagramAccountId 
              : parseInt(result.data.instagramAccountId as string);
            const instagramAccount = await storage.getInstagramAccount(instagramAccountId);
            if (!instagramAccount) {
              return res.status(404).json({ message: "Instagram account not found" });
            }
            
            publishResult = await publishPostToInstagram({
              ...result.data,
              userId: user.id,
              id: 0,
              createdAt: new Date()
            } as any);
            platformName = 'Instagram';
          } else {
            // Publish to Facebook
            if (!result.data.accountId) {
              return res.status(400).json({ message: "No Facebook account selected" });
            }
            
            const account = await storage.getFacebookAccount(result.data.accountId as number);
            if (!account) {
              return res.status(404).json({ message: "Facebook account not found" });
            }
            
            publishResult = await publishPostToFacebook({
              ...result.data,
              userId: user.id,
              id: 0,
              createdAt: new Date(),
              uploadId
            } as any);
            platformName = 'Facebook';
          }

          if (publishResult.success) {
            const post = await storage.createPost({
              ...result.data,
              userId: user.id,
              platform,
              status: "published",
              facebookPostId: platform === 'facebook' ? publishResult.data?.postId : undefined,
              instagramPostId: platform === 'instagram' ? publishResult.data?.instagramPostId : undefined
            } as any);

            await storage.createActivity({
              userId: user.id,
              type: "post_published",
              description: `Post published immediately to ${platformName}: ${result.data.content.substring(0, 50)}...`,
              metadata: { 
                postId: post.id, 
                platform,
                platformResponse: publishResult.data
              }
            });

            console.log(`✅ PUBLISHED: Post ${post.id} published to ${platformName}`);
            return res.status(201).json(post);
          } else {
            const post = await storage.createPost({
              ...result.data,
              userId: user.id,
              platform,
              status: "failed",
              errorMessage: publishResult.error || "Failed to publish"
            } as any);

            return res.status(500).json({ message: "Failed to publish", error: publishResult.error, post });
          }
        } catch (error) {
          const platform = result.data.platform || 'facebook';
          const post = await storage.createPost({
            ...result.data,
            userId: user.id,
            platform,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error"
          } as any);

          return res.status(500).json({ message: "Failed to publish", error: error instanceof Error ? error.message : "Unknown error", post });
        }
      } else if (result.data.status === "scheduled") {
        // SCHEDULE - Save for future publication
        const platform = result.data.platform || 'facebook';
        console.log(`📅 SCHEDULE: Saving for future publication to ${platform.toUpperCase()}`);
        
        if (!result.data.scheduledFor) {
          return res.status(400).json({ message: "Scheduled date is required for scheduled posts" });
        }

        // Import unified timezone conversion utility
        const { parseISTDateToUTC } = await import('./utils/timezoneUtils');
        
        // Convert scheduledFor from IST to UTC for consistent storage
        const scheduledForInput = result.data.scheduledFor instanceof Date 
          ? result.data.scheduledFor.toISOString() 
          : result.data.scheduledFor;
        const scheduledForUTC = parseISTDateToUTC(scheduledForInput, 'API scheduled post');
        
        const post = await storage.createPost({
          ...result.data,
          userId: user.id,
          platform,
          scheduledFor: scheduledForUTC
        } as any);

        // Set up the actual scheduling job
        const { schedulePostPublication } = await import('./services/postService');
        schedulePostPublication(post);

        await storage.createActivity({
          userId: user.id,
          type: "post_scheduled",
          description: `Post scheduled for ${platform === 'instagram' ? 'Instagram' : 'Facebook'} at ${result.data.scheduledFor}: ${result.data.content.substring(0, 50)}...`,
          metadata: { postId: post.id, platform }
        });

        console.log(`✅ SCHEDULED: Post ${post.id} scheduled for ${platform.toUpperCase()} at ${post.scheduledFor}`);
        return res.status(201).json(post);
      } else {
        // PUBLISH LATER - Save as draft
        const platform = result.data.platform || 'facebook';
        console.log(`📝 PUBLISH LATER: Saving as draft for ${platform.toUpperCase()}`);
        
        const post = await storage.createPost({
          ...result.data,
          userId: user.id,
          platform,
          status: "draft"
        } as any);

        await storage.createActivity({
          userId: user.id,
          type: "post_drafted",
          description: `Post saved as draft for ${platform === 'instagram' ? 'Instagram' : 'Facebook'}: ${result.data.content.substring(0, 50)}...`,
          metadata: { postId: post.id, platform }
        });

        console.log(`✅ DRAFT: Post ${post.id} saved as draft for ${platform.toUpperCase()}`);
        return res.status(201).json(post);
      }
    } catch (error) {
      console.error("Error creating post:", error);
      return res.status(500).json({ message: "Failed to create post" });
    }
  });

  // Other API routes (simplified for this fix)
  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const posts = await storage.getAllPosts();
      const accounts = await storage.getFacebookAccounts(1);
      
      const scheduled = posts.filter(p => p.status === "scheduled").length;
      const publishedToday = posts.filter(p => 
        p.status === "published" && 
        p.publishedAt && 
        new Date(p.publishedAt).toDateString() === new Date().toDateString()
      ).length;
      
      res.json({
        scheduled,
        publishedToday,
        accounts: accounts.length,
        totalPosts: posts.length
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/facebook-accounts", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const accounts = await storage.getFacebookAccounts(user.id);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching Facebook accounts:", error);
      res.status(500).json({ message: "Failed to fetch Facebook accounts" });
    }
  });

  app.post("/api/facebook-accounts/refresh", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get user's current Facebook accounts to find access token
      const existingAccounts = await storage.getFacebookAccounts(user.id);
      if (existingAccounts.length === 0) {
        return res.status(400).json({ message: "No Facebook accounts found. Please connect your Facebook account first." });
      }

      // Use the first account's access token to fetch all pages
      const userAccessToken = existingAccounts[0].accessToken;
      
      const { HootsuiteStyleFacebookService } = await import('./services/hootsuiteStyleFacebookService');
      const pages = await HootsuiteStyleFacebookService.getUserManagedPages(userAccessToken);
      
      let syncedCount = 0;
      let updatedCount = 0;
      
      for (const page of pages) {
        // Check if page already exists
        const existingPage = existingAccounts.find(acc => acc.pageId === page.id);
        
        if (existingPage) {
          // Update existing page
          await storage.updateFacebookAccount(existingPage.id, {
            name: page.name,
            accessToken: page.access_token,
            isActive: true
          });
          updatedCount++;
        } else {
          // Create new page
          await storage.createFacebookAccount({
            userId: user.id,
            name: page.name,
            pageId: page.id,
            accessToken: page.access_token,
            isActive: true
          });
          syncedCount++;
        }
      }

      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: 'facebook_pages_synced',
        description: `Facebook pages synchronized: ${syncedCount} new, ${updatedCount} updated`,
        metadata: { newPages: syncedCount, updatedPages: updatedCount }
      });

      res.json({ 
        success: true, 
        message: `Successfully synced Facebook pages: ${syncedCount} new, ${updatedCount} updated`,
        newPages: syncedCount,
        updatedPages: updatedCount
      });
    } catch (error) {
      console.error("Error refreshing Facebook pages:", error);
      res.status(500).json({ message: "Failed to refresh Facebook pages" });
    }
  });

  // Instagram account routes
  app.get("/api/instagram-accounts", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const accounts = await storage.getInstagramAccounts(user.id);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching Instagram accounts:", error);
      res.status(500).json({ message: "Failed to fetch Instagram accounts" });
    }
  });

  app.post("/api/instagram-accounts/connect", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { pageAccessToken } = req.body;
      
      if (!pageAccessToken) {
        return res.status(400).json({ message: "Page access token is required" });
      }

      const { InstagramService } = await import('./services/instagramService');
      const result = await InstagramService.getInstagramAccountsFromPages(pageAccessToken);
      
      if (!result.success || !result.accounts || result.accounts.length === 0) {
        return res.status(400).json({ 
          message: result.error || "No Instagram Business accounts found connected to your Facebook Pages" 
        });
      }

      let connectedCount = 0;
      
      for (const igAccount of result.accounts) {
        const existingAccount = await storage.getInstagramAccounts(user.id);
        const exists = existingAccount.find(acc => acc.businessAccountId === igAccount.id);
        
        if (!exists) {
          await storage.createInstagramAccount({
            userId: user.id,
            username: igAccount.username,
            businessAccountId: igAccount.id,
            connectedPageId: '', // This will be updated when we have page context
            accessToken: pageAccessToken,
            profilePictureUrl: igAccount.profile_picture_url,
            followersCount: igAccount.followers_count || 0,
            isActive: true
          });
          connectedCount++;
        }
      }

      await storage.createActivity({
        userId: user.id,
        type: 'instagram_accounts_connected',
        description: `Connected ${connectedCount} Instagram Business account(s)`,
        metadata: { count: connectedCount }
      });

      res.json({ 
        success: true, 
        message: `Successfully connected ${connectedCount} Instagram account(s)`,
        accounts: result.accounts
      });
    } catch (error) {
      console.error("Error connecting Instagram accounts:", error);
      res.status(500).json({ message: "Failed to connect Instagram accounts" });
    }
  });

  app.post("/api/instagram/publish", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { accountId, imageUrl, videoUrl, caption, mediaType } = req.body;
      
      if (!accountId) {
        return res.status(400).json({ message: "Instagram account ID is required" });
      }

      const account = await storage.getInstagramAccount(accountId);
      if (!account) {
        return res.status(404).json({ message: "Instagram account not found" });
      }

      const { InstagramService } = await import('./services/instagramService');
      const result = await InstagramService.publishPost(
        account.businessAccountId,
        account.accessToken,
        {
          imageUrl,
          videoUrl,
          caption,
          mediaType: mediaType || (videoUrl ? 'VIDEO' : 'IMAGE')
        }
      );

      if (result.success) {
        await storage.createActivity({
          userId: user.id,
          type: 'instagram_post_published',
          description: `Published ${mediaType || 'post'} to Instagram @${account.username}`,
          metadata: { accountId, postId: result.postId }
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error publishing to Instagram:", error);
      res.status(500).json({ message: "Failed to publish to Instagram" });
    }
  });

  app.delete("/api/instagram-accounts/:id", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const accountId = parseInt(req.params.id);
      const account = await storage.getInstagramAccount(accountId);
      
      if (!account) {
        return res.status(404).json({ message: "Instagram account not found" });
      }

      if (account.userId !== user.id) {
        return res.status(403).json({ message: "Unauthorized to delete this account" });
      }

      await storage.deleteInstagramAccount(accountId);
      
      await storage.createActivity({
        userId: user.id,
        type: 'instagram_account_removed',
        description: `Removed Instagram account @${account.username}`,
        metadata: { accountId }
      });

      res.json({ success: true, message: "Instagram account removed successfully" });
    } catch (error) {
      console.error("Error deleting Instagram account:", error);
      res.status(500).json({ message: "Failed to delete Instagram account" });
    }
  });

  app.get("/api/custom-labels", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const labels = await storage.getCustomLabels(user.id);
      res.json(labels);
    } catch (error) {
      console.error("Error fetching custom labels:", error);
      res.status(500).json({ message: "Failed to fetch custom labels" });
    }
  });

  app.get("/api/posts", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const posts = await storage.getPosts(user.id);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.get("/api/posts/upcoming", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const posts = await storage.getUpcomingPosts(user.id);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching upcoming posts:", error);
      res.status(500).json({ message: "Failed to fetch upcoming posts" });
    }
  });

  // PUT endpoint for updating posts
  app.put("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.id);
      const user = await authenticateUser(req);
      
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }
      
      // Check if post exists and belongs to the user
      const existingPost = await storage.getPost(postId);
      if (!existingPost) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      if (existingPost.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to update this post" });
      }
      
      console.log('🔄 UPDATING POST:', postId, 'with data:', req.body);
      
      // Prepare update data - convert scheduledFor string to Date if needed
      const updateData = { ...req.body };
      if (updateData.scheduledFor && typeof updateData.scheduledFor === 'string') {
        updateData.scheduledFor = new Date(updateData.scheduledFor);
        console.log('🔄 Converted scheduledFor to Date:', updateData.scheduledFor);
      }
      
      // Update the post
      const updatedPost = await storage.updatePost(postId, updateData);
      if (!updatedPost) {
        return res.status(404).json({ message: "Post not found after update" });
      }
      
      console.log('✅ POST UPDATED:', updatedPost);
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: 'post_updated',
        description: `Updated ${updatedPost.status} post`,
        metadata: { postId: updatedPost.id }
      });
      
      res.json(updatedPost);
    } catch (error) {
      console.error('Error updating post:', error);
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  app.get("/api/activities", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const activities = await storage.getActivities(user.id, 10);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Google Sheets Integration routes
  app.get("/api/google-sheets-integration", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const integration = await storage.getGoogleSheetsIntegration(user.id);
      res.json(integration || { connected: false });
    } catch (error) {
      console.error("Error fetching Google Sheets integration:", error);
      res.status(500).json({ message: "Failed to fetch Google Sheets integration" });
    }
  });

  app.post("/api/google-sheets-integration", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { accessToken, refreshToken, spreadsheetId } = req.body;
      
      if (!accessToken || !spreadsheetId) {
        return res.status(400).json({ message: "Access token and spreadsheet ID are required" });
      }

      const existingIntegration = await storage.getGoogleSheetsIntegration(user.id);
      let integration;
      
      if (existingIntegration) {
        integration = await storage.updateGoogleSheetsIntegration(user.id, {
          accessToken,
          refreshToken,
          spreadsheetId
        });
      } else {
        integration = await storage.createGoogleSheetsIntegration({
          userId: user.id,
          accessToken,
          refreshToken,
          spreadsheetId
        });
      }
      
      await storage.createActivity({
        userId: user.id,
        type: "google_sheets_connected",
        description: "Google Sheets integration connected",
        metadata: { integrationId: integration?.id }
      });
      
      res.status(201).json(integration);
    } catch (error) {
      console.error("Error setting up Google Sheets integration:", error);
      res.status(500).json({ message: "Failed to set up Google Sheets integration" });
    }
  });

  // CSV Analysis endpoint for preview functionality with optional AI conversion
  app.post('/api/csv-analyze', upload.single('file'), async (req: Request, res: Response) => {
    try {
      console.log('🔍 CSV analysis request received');
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      
      const useAiConverter = req.body.useAiConverter === 'true';
      console.log('📁 File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        aiConversion: useAiConverter
      });
      
      let result = await ExcelImportService.analyzeExcelFile({
        fileBuffer: req.file.buffer,
        filename: req.file.originalname
      });
      
      if (!result.success) {
        console.error('CSV analysis failed:', result.error);
        return res.status(400).json({
          error: result.error,
          details: result.details
        });
      }

      // If AI conversion is requested, try to convert the format
      let aiConversionResult = null;
      if (useAiConverter && result.data && result.data.length > 0) {
        try {
          const { OpenAICsvConverter } = await import('./services/openaiCsvConverter');
          const converter = new OpenAICsvConverter();
          
          console.log('🤖 Attempting AI conversion of CSV format...');
          const conversionResult = await converter.convertCsvFormat(result.data);
          
          if (conversionResult.success && conversionResult.convertedData) {
            console.log('✅ AI conversion successful');
            result.data = conversionResult.convertedData;
            aiConversionResult = {
              success: true,
              originalFormat: conversionResult.originalFormat,
              detectedColumns: conversionResult.detectedColumns
            };
          } else {
            console.log('⚠️ AI conversion failed, using original data');
            aiConversionResult = {
              success: false,
              error: conversionResult.error
            };
          }
        } catch (aiError) {
          console.error('❌ AI conversion error:', aiError);
          aiConversionResult = {
            success: false,
            error: aiError instanceof Error ? aiError.message : 'AI conversion failed'
          };
        }
      }
      
      console.log('✅ CSV analysis successful:', {
        totalRows: result.data?.length || 0,
        googleDriveVideos: result.googleDriveVideos || 0,
        regularVideos: result.regularVideos || 0,
        aiConversion: aiConversionResult?.success || false
      });
      
      res.json({
        success: true,
        data: result.data,
        totalRows: result.data?.length || 0,
        googleDriveVideos: result.googleDriveVideos || 0,
        regularVideos: result.regularVideos || 0,
        estimatedSizes: result.estimatedSizes || [],
        aiConversion: aiConversionResult
      });
      
    } catch (error) {
      console.error('CSV analysis error:', error);
      res.status(500).json({
        error: 'Internal server error during CSV analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Excel/CSV Import Routes (replacing Google Sheets)
  app.get("/api/excel-import/template", async (req: Request, res: Response) => {
    try {
      // Use default user ID (3) for template generation
      const userId = 3;
      
      // Get user's Facebook accounts to include in template
      const userAccounts = await storage.getFacebookAccounts(userId);
      const templateBuffer = ExcelImportService.generateTemplate();
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="posts-import-template.xlsx"');
      res.send(templateBuffer);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  app.post("/api/excel-import", upload.single('file'), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const accountId = req.body.accountId;
      const useAiConverter = req.body.useAiConverter === 'true';
      const userId = 3; // Use default user ID
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      if (!accountId) {
        return res.status(400).json({ message: "Facebook account selection is required" });
      }
      
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
        'application/csv'
      ];
      
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ 
          message: "Invalid file type. Please upload Excel (.xlsx, .xls) or CSV files only." 
        });
      }
      
      let result;
      if (file.mimetype.includes('csv')) {
        result = await ExcelImportService.parseCSVFile(file.buffer, userId, parseInt(accountId), useAiConverter);
      } else {
        result = await ExcelImportService.parseExcelFile(file.buffer, userId, parseInt(accountId), useAiConverter);
      }
      
      console.log("Import result:", result);
      
      if (result.success) {
        res.json({
          success: true,
          message: `Successfully imported ${result.imported} posts. ${result.failed > 0 ? `${result.failed} posts failed to import.` : ''}`,
          imported: result.imported,
          failed: result.failed,
          errors: result.errors
        });
      } else {
        console.error("Import failed with errors:", result.errors);
        res.status(400).json({
          success: false,
          message: "Import failed",
          errors: result.errors,
          imported: result.imported,
          failed: result.failed
        });
      }
    } catch (error) {
      console.error("Error importing file:", error);
      res.status(500).json({ message: "Failed to process import file" });
    }
  });

  // Test endpoint for media link detection
  app.post("/api/test-media-detection", async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      const { MediaLinkDetector } = await import('./services/mediaLinkDetector');
      const detector = new MediaLinkDetector();
      
      const detectedInfo = detector.detectMediaLink(url);
      
      res.json({
        success: true,
        url,
        detectedType: detectedInfo.type,
        isVideo: detectedInfo.isVideo,
        supported: detector.isSupported(url),
        message: `Detected: ${detectedInfo.type} - ${detectedInfo.isVideo ? 'Video' : 'File'}`
      });
      
    } catch (error) {
      console.error("Error testing media detection:", error);
      res.status(500).json({ error: "Failed to test media detection" });
    }
  });

  // Test endpoint for Facebook video download
  app.post("/api/test-facebook-download", async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      console.log('🧪 Testing Facebook video download for:', url);
      
      const { FacebookVideoDownloader } = await import('./services/facebookVideoDownloader');
      const downloadResult = await FacebookVideoDownloader.downloadVideo(url);
      
      res.json({
        success: downloadResult.success,
        url,
        filePath: downloadResult.filePath,
        filename: downloadResult.filename,
        error: downloadResult.error,
        videoInfo: downloadResult.videoInfo,
        message: downloadResult.success ? 
          `Downloaded successfully: ${downloadResult.filename}` : 
          `Download failed: ${downloadResult.error}`
      });
      
    } catch (error) {
      console.error("Error testing Facebook download:", error);
      res.status(500).json({ error: "Failed to test Facebook download: " + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // DELETE individual post by ID
  app.delete("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.id);
      const user = await authenticateUser(req);
      
      if (!user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
      }
      
      // Check if post exists and belongs to the user
      const existingPost = await storage.getPost(postId);
      if (!existingPost) {
        return res.status(404).json({ error: 'Post not found' });
      }
      
      if (existingPost.userId !== user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this post' });
      }
      
      // Cancel scheduling if post is scheduled
      if (existingPost.status === 'scheduled') {
        const { cancelScheduledPost } = await import('./services/postService');
        await cancelScheduledPost(postId);
      }
      
      // Delete the post
      const success = await storage.deletePost(postId);
      if (!success) {
        return res.status(500).json({ error: 'Failed to delete post' });
      }
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: 'post_deleted',
        description: `Deleted ${existingPost.status} post`,
        metadata: { postContent: existingPost.content.substring(0, 50) }
      });
      
      console.log(`✅ DELETED: Post ${postId} deleted by user ${user.id}`);
      res.json({ success: true, message: 'Post deleted successfully' });
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  });

  app.delete("/api/posts/scheduled/all", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all scheduled posts for this user
      const allScheduledPosts = await storage.getPostsByStatus('scheduled');
      const scheduledPosts = allScheduledPosts.filter(post => post.userId === user.id);
      
      // Delete all scheduled posts
      let deletedCount = 0;
      for (const post of scheduledPosts) {
        await storage.deletePost(post.id);
        deletedCount++;
      }

      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: 'bulk_posts_deleted',
        description: `Deleted all ${deletedCount} scheduled posts`,
        metadata: { deletedCount }
      });

      res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} scheduled posts`,
        deletedCount
      });
    } catch (error) {
      console.error("Error deleting scheduled posts:", error);
      res.status(500).json({ message: "Failed to delete scheduled posts" });
    }
  });

  // Health check endpoint for Google Drive integration
  app.get('/api/health/drive-integration', async (req: Request, res: Response) => {
    try {
      const { ImprovedGoogleDriveService } = await import('./services/improvedGoogleDriveService');
      const driveService = new ImprovedGoogleDriveService();
      const health = await driveService.healthCheck();
      
      res.json({
        status: Object.values(health).every(v => v) ? 'healthy' : 'unhealthy',
        checks: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.post("/api/import-from-google-sheets", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { spreadsheetId, sheetName, range, accountId } = req.body;
      
      if (!spreadsheetId || !sheetName || !accountId) {
        return res.status(400).json({ 
          message: "Spreadsheet ID, sheet name, and Facebook account are required" 
        });
      }

      // Check if user has Google Sheets integration
      const integration = await storage.getGoogleSheetsIntegration(user.id);
      if (!integration) {
        return res.status(400).json({ 
          message: "Google Sheets integration not found. Please connect your Google account first." 
        });
      }

      // Verify Facebook account exists
      const account = await storage.getFacebookAccount(accountId);
      if (!account || account.userId !== user.id) {
        return res.status(400).json({ message: "Facebook account not found" });
      }

      const result = await GoogleSheetsService.importFromSheet({
        accessToken: integration.accessToken,
        spreadsheetId,
        sheetName,
        range: range || 'A:Z',
        userId: user.id,
        accountId
      });

      if (result.success) {
        await storage.createActivity({
          userId: user.id,
          type: "google_sheets_imported",
          description: `Imported ${result.postsCreated} posts from Google Sheets`,
          metadata: { 
            spreadsheetId,
            sheetName,
            postsCreated: result.postsCreated
          }
        });

        res.json({
          success: true,
          message: `Successfully imported ${result.postsCreated} posts`,
          postsCreated: result.postsCreated
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || "Failed to import from Google Sheets"
        });
      }
    } catch (error) {
      console.error("Error importing from Google Sheets:", error);
      res.status(500).json({ message: "Failed to import from Google Sheets" });
    }
  });

  // Progress tracking endpoint for real-time video upload updates
  app.get('/api/upload-progress/:uploadId', async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.params;
      
      // Validate uploadId format
      if (!uploadId || typeof uploadId !== 'string' || uploadId.length < 5) {
        return res.status(400).json({ message: 'Invalid upload ID format' });
      }
      
      const { progressTracker } = await import('./services/progressTrackingService');
      
      // Clean up expired uploads periodically to prevent memory buildup
      progressTracker.cleanupCompletedUploads();
      
      const progress = progressTracker.getProgress(uploadId);
      if (!progress) {
        // Instead of 404, return a completion status for uploads that may have finished
        return res.status(200).json({ 
          uploadId,
          step: 'Upload completed - Check Recent Activity for status',
          percentage: 100,
          details: 'Upload processing completed. Check Recent Activity tab for results.',
          timestamp: new Date().toISOString()
        });
      }
      
      // Ensure we return valid JSON with sanitized data
      const sanitizedProgress = {
        uploadId: progress.uploadId,
        step: String(progress.step || 'Processing...'),
        percentage: Math.max(0, Math.min(100, Number(progress.percentage) || 0)),
        details: String(progress.details || 'Upload in progress...'),
        timestamp: progress.timestamp
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.json(sanitizedProgress);
      
    } catch (error) {
      console.error('Error fetching upload progress:', error);
      res.status(500).json({ 
        error: 'Failed to fetch progress',
        message: 'Internal server error during progress tracking'
      });
    }
  });

  // Scheduling system status and debugging endpoints
  app.get('/api/scheduling-status', async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      const { ReliableSchedulingService } = await import('./services/reliableSchedulingService');
      const { SystemMonitoringService } = await import('./services/systemMonitoringService');
      
      const status = ReliableSchedulingService.getStatus();
      const health = SystemMonitoringService.getHealthStatus();
      const overduePosts = await storage.getOverduePosts();
      const scheduledPosts = await storage.getScheduledPosts();
      
      res.json({
        system: {
          ...status,
          health
        },
        overduePosts: overduePosts.length,
        scheduledPosts: scheduledPosts.length,
        lastCheck: new Date().toISOString(),
        scheduledPostsList: scheduledPosts.map(p => ({
          id: p.id,
          content: p.content?.substring(0, 50) + '...',
          scheduledFor: p.scheduledFor,
          status: p.status
        }))
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // API endpoint to get duplicate prevention statistics for production monitoring
  app.get('/api/duplicate-prevention-stats', async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get race condition prevention activities from last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activities = await storage.getActivities(user.id);
      
      const raceConditionActivities = activities.filter(activity => 
        activity.type === 'system_race_condition_prevented' && 
        activity.createdAt && new Date(activity.createdAt) > twentyFourHoursAgo
      );
      
      // Get duplicate posts prevention count
      const preventionCount = raceConditionActivities.length;
      
      // Get successful publications in last 24 hours
      const successfulPublications = activities.filter(activity => 
        activity.type === 'post_published' && 
        activity.createdAt && new Date(activity.createdAt) > twentyFourHoursAgo
      ).length;
      
      res.json({
        duplicate_prevention: {
          race_conditions_prevented_24h: preventionCount,
          successful_publications_24h: successfulPublications,
          protection_active: true,
          last_prevention: raceConditionActivities.length > 0 ? raceConditionActivities[0].createdAt : null,
          prevented_posts: raceConditionActivities.map(activity => {
            const metadata = activity.metadata as any;
            return {
              postId: metadata?.postId,
              preventedBy: metadata?.preventedBy,
              scheduledTime: metadata?.originalScheduledTime,
              preventedAt: activity.createdAt
            };
          })
        },
        system_health: {
          dual_scheduler_protection: 'ACTIVE',
          atomic_locks: 'ENABLED',
          production_ready: true
        }
      });
    } catch (error) {
      console.error('Error getting duplicate prevention stats:', error);
      res.status(500).json({ error: 'Failed to get duplicate prevention stats' });
    }
  });

  // Force check for overdue posts (manual trigger)
  app.post('/api/force-check-posts', async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      const { ReliableSchedulingService } = await import('./services/reliableSchedulingService');
      
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

  // Reports routes
  app.use('/api/reports', reportsRouter);

  // Facebook Video Download and Upload Routes
  app.post('/api/facebook-video/download', async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: "Facebook video URL is required" 
        });
      }

      console.log('🎥 Starting Facebook video download for URL:', url);

      const { FacebookVideoDownloader } = await import('./services/facebookVideoDownloader');
      const result = await FacebookVideoDownloader.downloadVideo(url);

      if (result.success) {
        await storage.createActivity({
          userId: user.id,
          type: "facebook_video_downloaded",
          description: `Downloaded Facebook video: ${result.filename}`,
          metadata: { 
            url,
            filename: result.filename,
            videoInfo: result.videoInfo
          }
        });

        console.log('✅ Facebook video download completed:', result.filename);
      }

      res.json(result);
    } catch (error) {
      console.error("Error downloading Facebook video:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to download video"
      });
    }
  });

  app.post('/api/facebook-video/upload', async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { filePath, accountId, content, videoInfo } = req.body;
      
      if (!filePath || !accountId) {
        return res.status(400).json({ 
          success: false,
          error: "File path and account ID are required" 
        });
      }

      console.log('📤 Starting Facebook video upload for account:', accountId);

      const { FacebookVideoUploader } = await import('./services/facebookVideoUploader');
      const result = await FacebookVideoUploader.uploadVideo(
        filePath,
        parseInt(accountId),
        content || '',
        videoInfo
      );

      if (result.success) {
        await storage.createActivity({
          userId: user.id,
          type: "facebook_video_uploaded",
          description: `Uploaded video to Facebook: ${result.facebookPostId}`,
          metadata: { 
            accountId,
            facebookPostId: result.facebookPostId,
            content: content?.substring(0, 50) + '...'
          }
        });

        console.log('✅ Facebook video upload completed:', result.facebookPostId);
      }

      res.json(result);
    } catch (error) {
      console.error("Error uploading Facebook video:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to upload video"
      });
    }
  });

  // Health endpoint for keep-alive service
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      keepAlive: true
    });
  });

  // Force cleanup endpoint for clearing temporary video files
  app.post('/api/cleanup/force', async (req: Request, res: Response) => {
    try {
      const { tempFileManager } = await import('./utils/tempFileManager');
      const { execSync } = await import('child_process');
      
      console.log('🧹 FORCE CLEANUP: Starting manual cleanup...');
      
      // Get disk space before cleanup
      const beforeOutput = execSync('df -h /tmp | tail -1').toString();
      const beforeParts = beforeOutput.trim().split(/\s+/);
      const beforeUsed = beforeParts[2];
      const beforeAvail = beforeParts[3];
      
      // Run temp file manager sweep
      await tempFileManager.sweepTempDirs();
      
      // Force delete all video files in /tmp
      const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'];
      let deletedCount = 0;
      let freedSpace = 0;
      
      for (const ext of videoExtensions) {
        try {
          const findResult = execSync(`find /tmp -type f -name "*.${ext}" -exec ls -l {} \\; 2>/dev/null || true`).toString();
          if (findResult) {
            const files = findResult.trim().split('\n').filter(line => line);
            for (const fileLine of files) {
              const parts = fileLine.split(/\s+/);
              const size = parseInt(parts[4] || '0');
              const path = parts.slice(8).join(' ');
              
              if (path) {
                try {
                  execSync(`rm -f "${path}" 2>/dev/null || true`);
                  deletedCount++;
                  freedSpace += size;
                  console.log(`🗑️ Deleted: ${path} (${(size / 1024 / 1024).toFixed(2)}MB)`);
                } catch (e) {
                  // Skip if can't delete
                }
              }
            }
          }
        } catch (e) {
          // Continue if extension search fails
        }
      }
      
      // Get disk space after cleanup
      const afterOutput = execSync('df -h /tmp | tail -1').toString();
      const afterParts = afterOutput.trim().split(/\s+/);
      const afterUsed = afterParts[2];
      const afterAvail = afterParts[3];
      
      const freedMB = (freedSpace / 1024 / 1024).toFixed(2);
      
      console.log(`✅ FORCE CLEANUP COMPLETE: ${deletedCount} files deleted, ${freedMB}MB freed`);
      
      res.json({
        success: true,
        filesDeleted: deletedCount,
        spaceFeed: `${freedMB}MB`,
        diskBefore: { used: beforeUsed, available: beforeAvail },
        diskAfter: { used: afterUsed, available: afterAvail }
      });
    } catch (error) {
      console.error('❌ Force cleanup error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed'
      });
    }
  });

  return httpServer;
}