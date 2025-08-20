import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import type { PlatformUser } from "@shared/schema";

// Extend Express Request to include platformUser
declare global {
  namespace Express {
    interface Request {
      platformUser?: PlatformUser;
    }
  }
}

// Middleware to check if user is authenticated
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.session as any)?.platformUserId;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getPlatformUser(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Account not active" });
    }

    req.platformUser = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ message: "Authentication error" });
  }
};

// Middleware to check if user is an admin
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requireAuth(req, res, () => {
      if (req.platformUser?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    });
  } catch (error) {
    console.error("Admin middleware error:", error);
    res.status(500).json({ message: "Authorization error" });
  }
};

// Helper function to hash passwords
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Helper function to verify passwords
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

// Helper function to generate temporary passwords
export const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};