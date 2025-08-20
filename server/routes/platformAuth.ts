import express from "express";
import session from "express-session";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword, verifyPassword, generateTempPassword, requireAuth, requireAdmin } from "../middleware/auth";
import type { PlatformUser } from "@shared/schema";

const router = express.Router();

// Session configuration
export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'social-flow-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  }
});

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const createUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["user", "admin"]).default("user"),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  role: z.enum(["user", "admin"]).optional(),
  isActive: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid input", 
        errors: result.error.format() 
      });
    }

    const { email, password } = result.data;
    const user = await storage.getPlatformUserByEmail(email);

    if (!user) {
      return res.status(401).json({ message: "Wrong email or password" });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: "Your account is deactivated. Please contact an administrator." });
    }

    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Wrong email or password" });
    }

    // Update last login
    await storage.updatePlatformUserLastLogin(user.id);

    // Set session
    (req.session as any).platformUserId = user.id;

    const userResponse = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    res.json({ 
      message: "Login successful", 
      user: userResponse 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get current user endpoint
router.get('/me', requireAuth, async (req, res) => {
  const user = req.platformUser!;
  const userResponse = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
  res.json({ user: userResponse });
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ message: "Failed to logout" });
    }
    res.json({ message: "Logout successful" });
  });
});

// Change password endpoint
router.put('/change-password', requireAuth, async (req, res) => {
  try {
    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid input", 
        errors: result.error.format() 
      });
    }

    const { currentPassword, newPassword } = result.data;
    const user = req.platformUser!;

    const isValidCurrentPassword = await verifyPassword(currentPassword, user.password);
    if (!isValidCurrentPassword) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedNewPassword = await hashPassword(newPassword);
    await storage.updatePlatformUser(user.id, { password: hashedNewPassword });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Admin routes - User management
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await storage.getAllPlatformUsers();
    const usersResponse = users.map(user => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));
    res.json(usersResponse);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Create user (admin only)
router.post('/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid input", 
        errors: result.error.format() 
      });
    }

    const { fullName, email, role } = result.data;

    // Check if user already exists
    const existingUser = await storage.getPlatformUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);

    // Generate username from email
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    const userData = {
      username,
      fullName,
      email,
      password: hashedPassword,
      role,
      isActive: true,
    };

    const newUser = await storage.createPlatformUser(userData);

    const userResponse = {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
      tempPassword, // Send back temporary password for admin to share
    };

    res.status(201).json({ 
      message: "User created successfully", 
      user: userResponse 
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update user (admin only)
router.put('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = updateUserSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid input", 
        errors: result.error.format() 
      });
    }

    const updateData = result.data;

    // Check if email is being changed and doesn't conflict
    if (updateData.email) {
      const existingUser = await storage.getPlatformUserByEmail(updateData.email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "A user with this email already exists" });
      }
    }

    const updatedUser = await storage.updatePlatformUser(userId, updateData);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const userResponse = {
      id: updatedUser.id,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      role: updatedUser.role,
      isActive: updatedUser.isActive,
    };

    res.json({ 
      message: "User updated successfully", 
      user: userResponse 
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Reset user password (admin only)
router.post('/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await storage.getPlatformUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);

    await storage.updatePlatformUser(userId, { password: hashedPassword });

    res.json({ 
      message: "Password reset successfully", 
      tempPassword 
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;