import type { Express, Request, Response } from "express";
import { PlatformAuthService } from "../services/platformAuth";
import { registerSchema, loginSchema } from "../../shared/schema";

// Session interface extension
declare module 'express-session' {
  interface SessionData {
    platformUserId?: number;
    platformUser?: {
      id: number;
      username: string;
      email: string;
      fullName: string;
      role: string;
    };
  }
}

export function setupPlatformAuthRoutes(app: Express) {
  // Register new platform user
  app.post('/api/platform/auth/register', async (req: Request, res: Response) => {
    try {
      const result = await PlatformAuthService.register(req.body);
      
      if (result.success) {
        // Auto-login after registration
        req.session.platformUserId = result.user.id;
        req.session.platformUser = {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role || 'user'
        };

        res.status(201).json({
          success: true,
          message: 'Registration successful',
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error
        });
      }
    } catch (error) {
      console.error('Registration route error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Login platform user
  app.post('/api/platform/auth/login', async (req: Request, res: Response) => {
    try {
      const result = await PlatformAuthService.login(req.body);
      
      if (result.success) {
        // Set session data
        req.session.platformUserId = result.user.id;
        req.session.platformUser = {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role || 'user'
        };

        res.json({
          success: true,
          message: 'Login successful',
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role
          }
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.error
        });
      }
    } catch (error) {
      console.error('Login route error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Get current platform user
  app.get('/api/platform/auth/me', async (req: Request, res: Response) => {
    try {
      const userId = req.session.platformUserId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
      }

      const user = await PlatformAuthService.getUserById(userId);
      
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Get user route error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Platform authentication status
  app.get('/api/platform/auth/status', (req: Request, res: Response) => {
    const isAuthenticated = !!req.session.platformUserId;
    const user = req.session.platformUser;

    res.json({
      isAuthenticated,
      user: isAuthenticated ? user : null
    });
  });

  // Logout platform user
  app.post('/api/platform/auth/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to logout'
        });
      }

      res.json({
        success: true,
        message: 'Logout successful'
      });
    });
  });

  // Update profile
  app.put('/api/platform/auth/profile', async (req: Request, res: Response) => {
    try {
      const userId = req.session.platformUserId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
      }

      const result = await PlatformAuthService.updateProfile(userId, req.body);
      
      if (result.success) {
        // Update session data
        req.session.platformUser = {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role || 'user'
        };

        res.json({
          success: true,
          message: 'Profile updated successfully',
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error
        });
      }
    } catch (error) {
      console.error('Update profile route error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Change password
  app.post('/api/platform/auth/change-password', async (req: Request, res: Response) => {
    try {
      const userId = req.session.platformUserId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated'
        });
      }

      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      const result = await PlatformAuthService.changePassword(userId, currentPassword, newPassword);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Password changed successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error
        });
      }
    } catch (error) {
      console.error('Change password route error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });
}

// Middleware to check platform authentication
export function requirePlatformAuth(req: Request, res: Response, next: Function) {
  if (!req.session.platformUserId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
}