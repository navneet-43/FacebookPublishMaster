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

const authenticateUser = async (req: Request) => {
  if (req.isAuthenticated() && req.user) {
    return req.user as any;
  }
  return null;
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  app.use((req: any, res, next) => {
    req.storage = storage;
    next();
  });
  
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
      
      const user = await authenticateUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const result = insertPostSchema.safeParse(req.body);
      if (!result.success) {
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
        
        const post = await storage.createPost({
          ...result.data,
          userId: user.id,
          scheduledFor: result.data.scheduledFor ? new Date(result.data.scheduledFor) : undefined
        } as any);

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

  return httpServer;
}