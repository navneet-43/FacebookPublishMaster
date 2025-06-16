import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
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
import platformAuthRouter, { sessionMiddleware, requireAuth as requirePlatformAuth } from "./routes/platformAuth";
import { GoogleSheetsService } from "./services/googleSheetsService";
import { setupGoogleOAuthRoutes } from "./routes/googleOAuth";
import { ExcelImportService } from "./services/excelImportService";

const authenticateUser = async (req: Request) => {
  // Use default Facebook OAuth user (ID 3) without authentication
  return { id: 3 };
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

  // Setup session middleware for platform authentication
  app.use(sessionMiddleware);
  
  // Setup new platform authentication routes
  app.use('/api/platform/auth', platformAuthRouter);
  // Add alias for Replit environment URL rewrite
  app.use('/api/client/auth', platformAuthRouter);
  
  // Setup Google OAuth routes
  setupGoogleOAuthRoutes(app);
  
  // Facebook authentication routes
  app.get('/auth/facebook', 
    passport.authenticate('facebook', { 
      scope: ['email', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement']
    })
  );
  
  app.get('/auth/facebook/callback', 
    passport.authenticate('facebook', { failureRedirect: '/login' }),
    (req, res) => {
      res.redirect('/');
    }
  );

  // User authentication routes
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      (req.session as any).userId = user.id;
      res.json({ message: "Login successful", user: { id: user.id, username: user.username } });
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
        // PUBLISH NOW - Publish immediately to Facebook
        console.log(`🚀 PUBLISH NOW: Publishing immediately`);
        
        if (!result.data.accountId) {
          return res.status(400).json({ message: "No Facebook account selected" });
        }
        
        const account = await storage.getFacebookAccount(result.data.accountId as number);
        if (!account) {
          return res.status(404).json({ message: "Facebook account not found" });
        }

        try {
          const { publishPostToFacebook } = await import('./services/postService');
          const publishResult = await publishPostToFacebook({
            ...result.data,
            userId: user.id,
            id: 0,
            createdAt: new Date()
          } as any);

          if (publishResult.success) {
            const post = await storage.createPost({
              ...result.data,
              userId: user.id,
              status: "published"
            } as any);

            await storage.createActivity({
              userId: user.id,
              type: "post_published",
              description: `Post published immediately: ${result.data.content.substring(0, 50)}...`,
              metadata: { postId: post.id, facebookResponse: publishResult.data }
            });

            console.log(`✅ PUBLISHED: Post ${post.id} published to Facebook`);
            return res.status(201).json(post);
          } else {
            const post = await storage.createPost({
              ...result.data,
              userId: user.id,
              status: "failed",
              errorMessage: publishResult.error || "Failed to publish"
            } as any);

            return res.status(500).json({ message: "Failed to publish", error: publishResult.error, post });
          }
        } catch (error) {
          const post = await storage.createPost({
            ...result.data,
            userId: user.id,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error"
          } as any);

          return res.status(500).json({ message: "Failed to publish", error: error instanceof Error ? error.message : "Unknown error", post });
        }
      } else if (result.data.status === "scheduled") {
        // SCHEDULE - Save for future publication
        console.log(`📅 SCHEDULE: Saving for future publication`);
        
        if (!result.data.scheduledFor) {
          return res.status(400).json({ message: "Scheduled date is required for scheduled posts" });
        }

        const post = await storage.createPost({
          ...result.data,
          userId: user.id,
          scheduledFor: new Date(result.data.scheduledFor)
        } as any);

        // Set up the actual scheduling job
        const { schedulePostPublication } = await import('./services/postService');
        schedulePostPublication(post);

        await storage.createActivity({
          userId: user.id,
          type: "post_scheduled",
          description: `Post scheduled for ${result.data.scheduledFor}: ${result.data.content.substring(0, 50)}...`,
          metadata: { postId: post.id }
        });

        console.log(`✅ SCHEDULED: Post ${post.id} scheduled for ${post.scheduledFor}`);
        return res.status(201).json(post);
      } else {
        // PUBLISH LATER - Save as draft
        console.log(`📝 PUBLISH LATER: Saving as draft`);
        
        const post = await storage.createPost({
          ...result.data,
          userId: user.id,
          status: "draft"
        } as any);

        await storage.createActivity({
          userId: user.id,
          type: "post_drafted",
          description: `Post saved as draft: ${result.data.content.substring(0, 50)}...`,
          metadata: { postId: post.id }
        });

        console.log(`✅ DRAFT: Post ${post.id} saved as draft`);
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
        result = await ExcelImportService.parseCSVFile(file.buffer, userId, parseInt(accountId));
      } else {
        result = await ExcelImportService.parseExcelFile(file.buffer, userId, parseInt(accountId));
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

  app.delete("/api/posts/scheduled/all", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all scheduled posts for this user
      const scheduledPosts = await storage.getPostsByStatus(user.id, 'scheduled');
      
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

  return httpServer;
}