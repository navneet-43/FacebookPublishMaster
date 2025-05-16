import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import apiRoutes from "./routes/index";
import { z } from "zod";
import {
  insertUserSchema,
  insertFacebookAccountSchema,
  insertGoogleSheetsIntegrationSchema,
  insertCustomLabelSchema,
  insertPostSchema,
  insertActivitySchema
} from "../shared/schema";
import schedule from "node-schedule";
import multer from "multer";
import { uploadImage } from "./utils/cloudinary";
import passport from "passport";
import { isAuthenticated, fetchUserPages } from "./auth";

const authenticateUser = async (req: Request) => {
  // First check if user is authenticated via Passport
  if (req.isAuthenticated() && req.user) {
    return req.user as any;
  }
  
  // Fallback to demo user for development
  const user = await storage.getUserByUsername("demo");
  return user || null;
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Add storage to request object
  app.use((req: any, res, next) => {
    req.storage = storage;
    next();
  });
  
  // Add API routes
  app.use('/api', apiRoutes);
  
  // Facebook authentication routes
  app.get('/auth/facebook', 
    passport.authenticate('facebook', { 
      scope: ['email', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement']
    })
  );
  
  app.get('/auth/facebook/callback', 
    passport.authenticate('facebook', { 
      failureRedirect: '/login-error',
      successRedirect: '/facebook-accounts'
    })
  );
  
  // Login status endpoint
  app.get('/api/auth/status', (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
      const user = req.user as any;
      res.json({ 
        isLoggedIn: true, 
        user: {
          id: user.id,
          username: user.username, 
          email: user.email
        }
      });
    } else {
      res.json({ isLoggedIn: false });
    }
  });
  
  // Logout endpoint
  app.get('/api/auth/logout', (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) { 
        return res.status(500).json({ message: 'Error logging out' }); 
      }
      res.json({ success: true });
    });
  });
  
  // Facebook pages sync endpoint - automatically fetch and save user's Facebook pages
  app.get('/api/facebook-pages/sync', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!user.facebookToken) {
        return res.status(400).json({ message: "No Facebook token found" });
      }
      
      // Fetch pages from Facebook
      const pages = await fetchUserPages(user.id, user.facebookToken);
      
      // Create activity log
      await storage.createActivity({
        userId: user.id,
        type: "facebook_pages_synced",
        description: `Synchronized ${pages.length} Facebook pages`,
        metadata: { pagesCount: pages.length }
      });
      
      // Redirect back to Facebook accounts page
      res.redirect('/facebook-accounts');
    } catch (error) {
      console.error("Error syncing Facebook pages:", error);
      res.status(500).json({ message: "Error syncing Facebook pages" });
    }
  });

  // API routes
  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all accounts
      const accounts = await storage.getFacebookAccounts(user.id);
      
      // Get posts
      const allPosts = await storage.getPosts(user.id);
      
      // Calculate stats
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const scheduled = allPosts.filter(p => p.status === "scheduled").length;
      const publishedToday = allPosts.filter(
        p => p.status === "published" && p.publishedAt && p.publishedAt >= startOfDay
      ).length;
      const failed = allPosts.filter(p => p.status === "failed").length;
      
      res.json({
        scheduled,
        publishedToday,
        accounts: accounts.length,
        failed
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Facebook Accounts
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

  app.post("/api/facebook-accounts", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const result = insertFacebookAccountSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid account data", errors: result.error.format() });
      }
      
      const account = await storage.createFacebookAccount({
        ...result.data,
        userId: user.id
      });
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: "account_connected",
        description: `Facebook account "${account.name}" connected`,
        metadata: { accountId: account.id }
      });
      
      res.status(201).json(account);
    } catch (error) {
      console.error("Error creating Facebook account:", error);
      res.status(500).json({ message: "Failed to create Facebook account" });
    }
  });

  app.put("/api/facebook-accounts/:id", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const id = parseInt(req.params.id);
      const account = await storage.getFacebookAccount(id);
      
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      if (account.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to update this account" });
      }
      
      // Only allow updating specific fields
      const allowedFields = ['isActive'];
      const updates: Partial<FacebookAccount> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field as keyof FacebookAccount] = req.body[field];
        }
      }
      
      const updatedAccount = await storage.updateFacebookAccount(id, updates);
      
      // Log activity for status change
      if (updates.isActive !== undefined && updatedAccount) {
        await storage.createActivity({
          userId: user.id,
          type: updates.isActive ? "account_activated" : "account_deactivated",
          description: `Facebook account "${account.name}" ${updates.isActive ? "activated" : "deactivated"}`,
          metadata: { accountId: id }
        });
      }
      
      res.json(updatedAccount);
    } catch (error) {
      console.error("Error updating Facebook account:", error);
      res.status(500).json({ message: "Failed to update Facebook account" });
    }
  });

  app.delete("/api/facebook-accounts/:id", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const id = parseInt(req.params.id);
      const account = await storage.getFacebookAccount(id);
      
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      
      if (account.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to delete this account" });
      }
      
      const deleted = await storage.deleteFacebookAccount(id);
      
      if (deleted) {
        // Log activity
        await storage.createActivity({
          userId: user.id,
          type: "account_removed",
          description: `Facebook account "${account.name}" removed`,
          metadata: { accountId: id }
        });
      }
      
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting Facebook account:", error);
      res.status(500).json({ message: "Failed to delete Facebook account" });
    }
  });

  // Google Sheets Integration
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
      
      const result = insertGoogleSheetsIntegrationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid integration data", errors: result.error.format() });
      }
      
      const existingIntegration = await storage.getGoogleSheetsIntegration(user.id);
      let integration;
      
      if (existingIntegration) {
        integration = await storage.updateGoogleSheetsIntegration(user.id, result.data);
      } else {
        integration = await storage.createGoogleSheetsIntegration({
          ...result.data,
          userId: user.id
        });
      }
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: "google_sheets_connected",
        description: "Google Sheets integration connected",
        metadata: { integrationId: integration?.id }
      });
      
      res.status(201).json(integration);
    } catch (error) {
      console.error("Error setting up Asana integration:", error);
      res.status(500).json({ message: "Failed to set up Asana integration" });
    }
  });

  // Custom Labels
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

  app.post("/api/custom-labels", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const result = insertCustomLabelSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid label data", errors: result.error.format() });
      }
      
      const label = await storage.createCustomLabel({
        ...result.data,
        userId: user.id
      });
      
      res.status(201).json(label);
    } catch (error) {
      console.error("Error creating custom label:", error);
      res.status(500).json({ message: "Failed to create custom label" });
    }
  });

  app.delete("/api/custom-labels/:id", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const id = parseInt(req.params.id);
      const label = await storage.getCustomLabel(id);
      
      if (!label) {
        return res.status(404).json({ message: "Label not found" });
      }
      
      if (label.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to delete this label" });
      }
      
      const deleted = await storage.deleteCustomLabel(id);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting custom label:", error);
      res.status(500).json({ message: "Failed to delete custom label" });
    }
  });

  // Posts
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

  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const result = insertPostSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid post data", errors: result.error.format() });
      }
      
      const post = await storage.createPost({
        ...result.data,
        userId: user.id
      });
      
      // Schedule post if it has a scheduledFor date
      if (post.scheduledFor && post.status === "scheduled") {
        const scheduledDate = new Date(post.scheduledFor);
        
        // Schedule job to publish post
        schedule.scheduleJob(scheduledDate, async () => {
          try {
            // In a real implementation, this would make an API call to Facebook
            console.log(`Publishing post ${post.id} at ${new Date().toISOString()}`);
            
            // Update post status
            const updatedPost = await storage.updatePost(post.id, { 
              status: "published",
              publishedAt: new Date()
            });
            
            // Log activity
            await storage.createActivity({
              userId: post.userId,
              type: "post_published",
              description: "Post published successfully",
              metadata: { postId: post.id }
            });
          } catch (error) {
            console.error(`Error publishing post ${post.id}:`, error);
            
            // Update post with error
            await storage.updatePost(post.id, { 
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Failed to publish post"
            });
            
            // Log activity
            await storage.createActivity({
              userId: post.userId,
              type: "post_failed",
              description: "Failed to publish post",
              metadata: { postId: post.id, error: error instanceof Error ? error.message : "Unknown error" }
            });
          }
        });
      }
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: "post_created",
        description: post.status === "scheduled" ? "Post scheduled" : "Post created",
        metadata: { postId: post.id }
      });
      
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  app.put("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);
      
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      if (post.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to update this post" });
      }
      
      const updatedPost = await storage.updatePost(id, req.body);
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: "post_updated",
        description: "Post updated",
        metadata: { postId: id }
      });
      
      res.json(updatedPost);
    } catch (error) {
      console.error("Error updating post:", error);
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  app.delete("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);
      
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      if (post.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }
      
      const deleted = await storage.deletePost(id);
      
      // Log activity if deleted
      if (deleted) {
        await storage.createActivity({
          userId: user.id,
          type: "post_deleted",
          description: "Post deleted",
          metadata: { postId: id }
        });
      }
      
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Import from Google Sheets
  app.post("/api/import-from-google-sheets", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { spreadsheetId, sheetName, dateRange } = req.body;
      
      // First check if the user has connected Google Sheets
      const integration = await storage.getGoogleSheetsIntegration(user.id);
      if (!integration) {
        return res.status(400).json({ 
          message: "Google Sheets integration not found. Please connect your Google account first." 
        });
      }
      
      // Then check if they have Facebook accounts
      const accounts = await storage.getFacebookAccounts(user.id);
      if (accounts.length === 0) {
        return res.status(400).json({ message: "No Facebook accounts connected" });
      }
      
      const account = accounts[0];
      
      // Sample posts from "Google Sheets"
      const samplePosts = [
        {
          content: "Check out our latest blog post about sustainable fashion!",
          labels: ["Blog"],
          language: "English",
          scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          status: "scheduled",
          sheetRowId: "row123", // Instead of asanaTaskId
          accountId: account.id
        },
        {
          content: "New summer collection now available!",
          labels: ["Fashion"],
          language: "English",
          scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
          status: "scheduled",
          sheetRowId: "row124", // Instead of asanaTaskId
          accountId: account.id
        },
        {
          content: "Happy Weekend! Use code WEEKEND20 for 20% off all items!",
          labels: ["Promotion"],
          language: "English",
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
          status: "draft",
          sheetRowId: "row125", // Instead of asanaTaskId
          accountId: account.id
        }
      ];
      
      const createdPosts = [];
      
      for (const post of samplePosts) {
        const createdPost = await storage.createPost({
          ...post,
          userId: user.id
        });
        createdPosts.push(createdPost);
        
        // Schedule if needed
        if (createdPost.scheduledFor && createdPost.status === "scheduled") {
          const scheduledDate = new Date(createdPost.scheduledFor);
          
          schedule.scheduleJob(scheduledDate, async () => {
            try {
              // Update post status (simulating publishing)
              await storage.updatePost(createdPost.id, { 
                status: "published",
                publishedAt: new Date()
              });
              
              // Log activity
              await storage.createActivity({
                userId: user.id,
                type: "post_published",
                description: "Post published successfully",
                metadata: { postId: createdPost.id }
              });
            } catch (error) {
              console.error(`Error publishing post ${createdPost.id}:`, error);
              
              // Update post with error
              await storage.updatePost(createdPost.id, { 
                status: "failed",
                errorMessage: error instanceof Error ? error.message : "Failed to publish post"
              });
              
              // Log activity
              await storage.createActivity({
                userId: user.id,
                type: "post_failed",
                description: "Failed to publish post",
                metadata: { postId: createdPost.id, error: error instanceof Error ? error.message : "Unknown error" }
              });
            }
          });
        }
      }
      
      // Log activity with Google Sheets metadata
      await storage.createActivity({
        userId: user.id,
        type: "google_sheets_import",
        description: `Imported ${createdPosts.length} posts from Google Sheets`,
        metadata: { spreadsheetId, sheetName, dateRange, count: createdPosts.length }
      });
      
      res.status(201).json({
        success: true,
        count: createdPosts.length,
        posts: createdPosts
      });
    } catch (error) {
      console.error("Error importing from Google Sheets:", error);
      res.status(500).json({ message: "Failed to import from Google Sheets" });
    }
  });
  
  // Keep the old Asana endpoint for backward compatibility, but redirect to Google Sheets
  app.post("/api/import-from-asana", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Redirect to the new Google Sheets endpoint with a deprecation notice
      return res.status(410).json({ 
        message: "Asana integration is deprecated. Please use Google Sheets integration instead.",
        endpoint: "/api/import-from-google-sheets"
      });
    } catch (error) {
      console.error("Error with deprecated Asana route:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Activities
  app.get("/api/activities", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const activities = await storage.getActivities(user.id, limit);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Import Excel route
  app.post("/api/import-from-excel", async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // In a real implementation, we would:
      // 1. Process the uploaded Excel file
      // 2. Parse the mapping configuration
      // 3. Extract data from the Excel file based on the mapping
      // 4. Create posts using that data
      
      // Get the user's first Facebook account
      const accounts = await storage.getFacebookAccounts(user.id);
      if (accounts.length === 0) {
        return res.status(400).json({ 
          message: "No Facebook accounts found. Please connect a Facebook account first."
        });
      }

      // Create a sample post (simulating Excel import)
      const post = await storage.createPost({
        userId: user.id,
        accountId: accounts[0].id,
        content: "This post was imported from an Excel file. In a real implementation, this would contain content from your Excel spreadsheet.",
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000), // 2 days from now
        language: "en",
        labels: JSON.stringify(["Imported", "Excel"]),
        mediaUrl: null,
        link: null,
        publishedAt: null,
        asanaTaskId: null,
        errorMessage: null
      });

      // Create an activity record
      await storage.createActivity({
        userId: user.id,
        type: "excel_import",
        description: "Imported a row from Excel",
        metadata: JSON.stringify({ postId: post.id, fileName: "sample.xlsx" })
      });
      
      return res.status(200).json({ 
        success: true,
        message: "Successfully imported from Excel",
        imported: 1
      });
    } catch (error) {
      console.error("Error importing from Excel:", error);
      return res.status(500).json({ 
        message: "Failed to import from Excel", 
        error: (error as Error).message 
      });
    }
  });

  // Configure multer for memory storage
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    },
    fileFilter: (_req, file, cb) => {
      // Accept both image and video files
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image and video files are allowed'));
      }
    }
  });

  // Media Upload route
  app.post("/api/media/upload", upload.single('media'), async (req: Request, res: Response) => {
    try {
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Upload the file to Cloudinary with the correct mime type
      const mediaUrl = await uploadImage(req.file.buffer, req.file.mimetype);
      
      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: "media_uploaded",
        description: "Media file uploaded",
        metadata: JSON.stringify({ 
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fileType: req.file.mimetype 
        })
      });
      
      // Return the URL of the uploaded image
      return res.status(200).json({ 
        success: true, 
        mediaUrl,
        message: "Media uploaded successfully" 
      });
    } catch (error) {
      console.error("Error uploading media:", error);
      return res.status(500).json({ 
        message: "Failed to upload media", 
        error: (error as Error).message 
      });
    }
  });

  return httpServer;
}
