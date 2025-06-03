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
  insertActivitySchema,
  FacebookAccount
} from "../shared/schema";
import schedule from "node-schedule";
import multer from "multer";
import { uploadImage } from "./utils/cloudinary";
import passport from "passport";
import { isAuthenticated, fetchUserPages } from "./auth";

const authenticateUser = async (req: Request) => {
  // Check if user is authenticated via Passport (Facebook OAuth)
  if (req.isAuthenticated() && req.user) {
    return req.user as any;
  }
  
  // No fallback - user must be properly authenticated
  return null;
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
  
  // Email/Password login endpoint
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      // Find user by email
      const users = await storage.getAllUsers();
      const user = users.find(u => u.email === email);
      
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      // For simplicity, we'll use plain text password comparison
      // In production, use bcrypt or similar for password hashing
      if (user.password !== password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      // Log the user in
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Login failed' });
        }
        res.json({ 
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName
          }
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  // Registration endpoint
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { username, email, password, fullName } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }
      
      const users = await storage.getAllUsers();
      const existingEmail = users.find(u => u.email === email);
      if (existingEmail) {
        return res.status(409).json({ message: "Email already registered" });
      }
      
      // Create new user
      const user = await storage.createUser({
        username,
        email,
        password, // In production, hash this password with bcrypt
        fullName
      });
      
      // Log the user in immediately after registration
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Registration successful but login failed' });
        }
        res.status(201).json({ 
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName
          }
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  // Login status endpoint
  app.get('/api/auth/status', (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
      const user = req.user as any;
      res.json({ 
        isLoggedIn: true, 
        user: {
          id: user.id,
          username: user.username, 
          email: user.email,
          fullName: user.fullName,
          facebookToken: user.facebookToken
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

  // Facebook OAuth routes
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
  
  // Test Facebook posting endpoint
  app.post('/api/facebook-test-post', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { accountId, message } = req.body;
      
      // Get the Facebook account
      const account = await storage.getFacebookAccount(accountId);
      if (!account) {
        return res.status(404).json({ message: "Facebook account not found" });
      }
      
      console.log(`Testing Facebook post for account: ${account.name}`);
      console.log(`Page ID: ${account.pageId}`);
      console.log(`Token length: ${account.accessToken.length}`);
      
      // Test with a simple text post
      const testMessage = message || "Test post from SocialFlow app";
      const endpoint = `https://graph.facebook.com/v16.0/${account.pageId}/feed`;
      
      const formData = new URLSearchParams();
      formData.append('message', testMessage);
      formData.append('access_token', account.accessToken);
      
      console.log(`Posting to: ${endpoint}`);
      console.log(`Message: ${testMessage}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });
      
      const data = await response.json();
      
      console.log('Facebook API Response:', {
        status: response.status,
        ok: response.ok,
        data: data
      });
      
      res.json({
        success: response.ok,
        status: response.status,
        response: data,
        endpoint: endpoint,
        message: testMessage
      });
      
    } catch (error) {
      console.error("Error testing Facebook post:", error);
      res.status(500).json({ message: "Failed to test post" });
    }
  });

  // Facebook token test endpoint
  app.get('/api/facebook-tokens/test', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      
      // Get user's Facebook accounts
      const accounts = await storage.getFacebookAccounts(user.id);
      const results = [];
      
      for (const account of accounts) {
        console.log(`Testing token for ${account.name} (${account.pageId})`);
        
        // Test basic token validity
        const tokenTest = await fetch(`https://graph.facebook.com/v16.0/me?access_token=${account.accessToken}`);
        const tokenData = await tokenTest.json();
        
        // Test page access
        const pageTest = await fetch(`https://graph.facebook.com/v16.0/${account.pageId}?access_token=${account.accessToken}`);
        const pageData = await pageTest.json();
        
        // Test posting permissions
        const permTest = await fetch(`https://graph.facebook.com/v16.0/${account.pageId}/permissions?access_token=${account.accessToken}`);
        const permData = await permTest.json();
        
        results.push({
          account: account.name,
          pageId: account.pageId,
          tokenValid: !tokenData.error,
          tokenError: tokenData.error?.message,
          pageAccess: !pageData.error,
          pageError: pageData.error?.message,
          permissions: permData.data || [],
          permissionError: permData.error?.message
        });
        
        console.log(`Test results for ${account.name}:`, {
          tokenValid: !tokenData.error,
          pageAccess: !pageData.error,
          hasPermissions: !!permData.data
        });
      }
      
      res.json({ results });
    } catch (error) {
      console.error("Error testing Facebook tokens:", error);
      res.status(500).json({ message: "Failed to test tokens" });
    }
  });

  // Facebook token refresh endpoint
  app.post('/api/facebook-tokens/refresh', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { userToken } = req.body;
      
      if (!userToken) {
        return res.status(400).json({ message: "User token required" });
      }
      
      const { refreshUserFacebookTokens } = await import('./services/facebookTokenService');
      await refreshUserFacebookTokens(user.id, userToken);
      
      res.json({ success: true, message: "Tokens refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing Facebook tokens:", error);
      res.status(500).json({ message: "Failed to refresh tokens" });
    }
  });

  // Facebook pages sync endpoint - automatically fetch and save user's Facebook pages
  app.get('/api/facebook-pages/sync', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!user.facebookToken) {
        // Redirect to Facebook OAuth flow to get token
        return res.redirect('/auth/facebook');
      }
      
      // Validate token before using it
      const { validateFacebookToken } = await import('./services/facebookTokenService');
      const isValidToken = await validateFacebookToken(user.facebookToken);
      
      if (!isValidToken) {
        console.log('Facebook token is invalid, redirecting to OAuth');
        return res.redirect('/auth/facebook');
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
      
      // Handle immediate vs scheduled posts
      if (post.scheduledFor && post.status === "scheduled") {
        // Schedule for future publication
        const scheduledDate = new Date(post.scheduledFor);
        
        schedule.scheduleJob(scheduledDate, async () => {
          try {
            console.log(`Publishing scheduled post ${post.id} at ${new Date().toISOString()}`);
            
            // Get the latest post data
            const currentPost = await storage.getPost(post.id);
            if (!currentPost) return;
            
            // Import the publishing function
            const { publishPostToFacebook } = await import('./services/postService');
            const result = await publishPostToFacebook(currentPost);
            
            if (result.success) {
              await storage.updatePost(post.id, { 
                status: "published",
                publishedAt: new Date()
              });
              
              await storage.createActivity({
                userId: post.userId,
                type: "post_published",
                description: "Scheduled post published to Facebook",
                metadata: { postId: post.id, facebookResponse: result.data }
              });
            } else {
              await storage.updatePost(post.id, { 
                status: "failed",
                errorMessage: result.error || "Failed to publish to Facebook"
              });
              
              await storage.createActivity({
                userId: post.userId,
                type: "post_failed",
                description: "Scheduled post failed to publish",
                metadata: { postId: post.id, error: result.error }
              });
            }
          } catch (error) {
            console.error(`Error publishing scheduled post ${post.id}:`, error);
            await storage.updatePost(post.id, { 
              status: "failed",
              errorMessage: error instanceof Error ? error.message : "Unknown error"
            });
          }
        });
      } else if (post.status === "draft" && post.accountId) {
        // Publish immediately for draft posts with account selected
        try {
          console.log(`Publishing immediate post ${post.id}`);
          
          const { publishPostToFacebook } = await import('./services/postService');
          const result = await publishPostToFacebook(post);
          
          if (result.success) {
            // Update post status to published
            const updatedPost = await storage.updatePost(post.id, {
              status: "published",
              publishedAt: new Date()
            });
            
            await storage.createActivity({
              userId: user.id,
              type: "post_published",
              description: "Post published immediately to Facebook",
              metadata: { postId: post.id, facebookResponse: result.data }
            });
            
            // Return the updated post
            res.status(201).json(updatedPost);
            return;
          } else {
            // Update post status to failed
            await storage.updatePost(post.id, {
              status: "failed",
              errorMessage: result.error || "Failed to publish to Facebook"
            });
            
            await storage.createActivity({
              userId: user.id,
              type: "post_failed",
              description: "Post failed to publish to Facebook",
              metadata: { postId: post.id, error: result.error }
            });
          }
        } catch (error) {
          console.error(`Error publishing immediate post ${post.id}:`, error);
          await storage.updatePost(post.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error"
          });
        }
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
      
      // Google Sheets integration requires proper API credentials
      return res.status(400).json({
        success: false,
        message: "Google Sheets integration requires proper API credentials. Please provide your Google Sheets API key and OAuth credentials to enable data import."
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

      // Excel import requires proper file parsing implementation
      return res.status(400).json({
        success: false,
        message: "Excel import feature requires file upload and parsing implementation. Please upload an actual Excel file with post content."
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
