import {
  User, InsertUser, users,
  PlatformUser, InsertPlatformUser, platformUsers,
  FacebookAccount, InsertFacebookAccount, facebookAccounts,
  GoogleSheetsIntegration, InsertGoogleSheetsIntegration, googleSheetsIntegrations,
  CustomLabel, InsertCustomLabel, customLabels,
  Post, InsertPost, posts,
  Activity, InsertActivity, activities
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, lt, gt, isNull } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // Legacy user operations (Facebook OAuth)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByFacebookId(facebookId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;

  // Platform user operations (new authentication system)
  getPlatformUser(id: number): Promise<PlatformUser | undefined>;
  getPlatformUserByUsername(username: string): Promise<PlatformUser | undefined>;
  getPlatformUserByEmail(email: string): Promise<PlatformUser | undefined>;
  createPlatformUser(user: InsertPlatformUser): Promise<PlatformUser>;
  updatePlatformUser(id: number, data: Partial<PlatformUser>): Promise<PlatformUser | undefined>;
  updatePlatformUserLastLogin(id: number): Promise<void>;
  getAllPlatformUsers(): Promise<PlatformUser[]>;

  // Facebook account operations
  getFacebookAccounts(userId: number): Promise<FacebookAccount[]>;
  getFacebookAccount(id: number): Promise<FacebookAccount | undefined>;
  createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount>;
  updateFacebookAccount(id: number, data: Partial<FacebookAccount>): Promise<FacebookAccount | undefined>;
  deleteFacebookAccount(id: number): Promise<boolean>;

  // Google Sheets integration operations
  getGoogleSheetsIntegration(userId: number): Promise<GoogleSheetsIntegration | undefined>;
  createGoogleSheetsIntegration(integration: InsertGoogleSheetsIntegration): Promise<GoogleSheetsIntegration>;
  updateGoogleSheetsIntegration(userId: number, data: Partial<GoogleSheetsIntegration>): Promise<GoogleSheetsIntegration | undefined>;
  createOrUpdateGoogleSheetsIntegration(data: InsertGoogleSheetsIntegration): Promise<GoogleSheetsIntegration>;

  // Custom label operations
  getCustomLabels(userId: number): Promise<CustomLabel[]>;
  getCustomLabel(id: number): Promise<CustomLabel | undefined>;
  createCustomLabel(label: InsertCustomLabel): Promise<CustomLabel>;
  updateCustomLabel(id: number, data: Partial<CustomLabel>): Promise<CustomLabel | undefined>;
  deleteCustomLabel(id: number): Promise<boolean>;

  // Post operations
  getPosts(userId: number): Promise<Post[]>;
  getUpcomingPosts(userId: number): Promise<Post[]>;
  getAllPosts(): Promise<Post[]>; // Get all posts across all users
  getScheduledPosts(): Promise<Post[]>; // Get all scheduled posts
  getFailedPosts(): Promise<Post[]>; // Get all failed posts
  getOverduePosts(): Promise<Post[]>; // Get posts that should have been published but are still scheduled
  getPostsByStatus(status: string): Promise<Post[]>; // Get posts by status
  getPost(id: number): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  updatePost(id: number, data: Partial<Post>): Promise<Post | undefined>;
  deletePost(id: number): Promise<boolean>;

  // Activity operations
  getActivities(userId: number, limit?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getUserByFacebookId(facebookId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.facebookId, facebookId));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  // Platform user operations (new authentication system)
  async getPlatformUser(id: number): Promise<PlatformUser | undefined> {
    const [user] = await db.select().from(platformUsers).where(eq(platformUsers.id, id));
    return user;
  }

  async getPlatformUserByUsername(username: string): Promise<PlatformUser | undefined> {
    const [user] = await db.select().from(platformUsers).where(eq(platformUsers.username, username));
    return user;
  }

  async getPlatformUserByEmail(email: string): Promise<PlatformUser | undefined> {
    const [user] = await db.select().from(platformUsers).where(eq(platformUsers.email, email));
    return user;
  }

  async createPlatformUser(userData: InsertPlatformUser): Promise<PlatformUser> {
    const [user] = await db.insert(platformUsers).values(userData).returning();
    return user;
  }

  async updatePlatformUser(id: number, data: Partial<PlatformUser>): Promise<PlatformUser | undefined> {
    const [updatedUser] = await db
      .update(platformUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(platformUsers.id, id))
      .returning();
    return updatedUser;
  }

  async updatePlatformUserLastLogin(id: number): Promise<void> {
    await db
      .update(platformUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(platformUsers.id, id));
  }

  async getAllPlatformUsers(): Promise<PlatformUser[]> {
    return await db.select().from(platformUsers).orderBy(desc(platformUsers.createdAt));
  }

  // Facebook account operations
  async getFacebookAccounts(userId: number): Promise<FacebookAccount[]> {
    return db.select().from(facebookAccounts).where(eq(facebookAccounts.userId, userId));
  }

  async getFacebookAccount(id: number): Promise<FacebookAccount | undefined> {
    const [account] = await db.select().from(facebookAccounts).where(eq(facebookAccounts.id, id));
    return account;
  }
  
  async getFacebookAccountByPageId(pageId: string): Promise<FacebookAccount | undefined> {
    const [account] = await db.select().from(facebookAccounts).where(eq(facebookAccounts.pageId, pageId));
    return account;
  }

  async createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount> {
    const [newAccount] = await db.insert(facebookAccounts).values(account).returning();
    return newAccount;
  }

  async updateFacebookAccount(id: number, data: Partial<FacebookAccount>): Promise<FacebookAccount | undefined> {
    const [updatedAccount] = await db
      .update(facebookAccounts)
      .set(data)
      .where(eq(facebookAccounts.id, id))
      .returning();
    return updatedAccount;
  }

  async deleteFacebookAccount(id: number): Promise<boolean> {
    // First delete all posts associated with this account
    await db
      .delete(posts)
      .where(eq(posts.accountId, id));
      
    // Then delete the account
    const [deleted] = await db
      .delete(facebookAccounts)
      .where(eq(facebookAccounts.id, id))
      .returning({ id: facebookAccounts.id });
    return !!deleted;
  }

  // Google Sheets integration operations
  async getGoogleSheetsIntegration(userId: number): Promise<GoogleSheetsIntegration | undefined> {
    const [integration] = await db
      .select()
      .from(googleSheetsIntegrations)
      .where(eq(googleSheetsIntegrations.userId, userId));
    return integration;
  }

  async createGoogleSheetsIntegration(integration: InsertGoogleSheetsIntegration): Promise<GoogleSheetsIntegration> {
    const [newIntegration] = await db
      .insert(googleSheetsIntegrations)
      .values(integration)
      .returning();
    return newIntegration;
  }

  async updateGoogleSheetsIntegration(userId: number, data: Partial<GoogleSheetsIntegration>): Promise<GoogleSheetsIntegration | undefined> {
    const [updatedIntegration] = await db
      .update(googleSheetsIntegrations)
      .set(data)
      .where(eq(googleSheetsIntegrations.userId, userId))
      .returning();
    return updatedIntegration;
  }

  async createOrUpdateGoogleSheetsIntegration(data: InsertGoogleSheetsIntegration): Promise<GoogleSheetsIntegration> {
    // Check if integration exists
    const existing = await this.getGoogleSheetsIntegration(data.userId!);
    
    if (existing) {
      // Update existing integration
      const updated = await this.updateGoogleSheetsIntegration(data.userId!, data);
      return updated!;
    } else {
      // Create new integration
      return await this.createGoogleSheetsIntegration(data);
    }
  }

  // Custom label operations
  async getCustomLabels(userId: number): Promise<CustomLabel[]> {
    return db
      .select()
      .from(customLabels)
      .where(eq(customLabels.userId, userId));
  }

  async getCustomLabel(id: number): Promise<CustomLabel | undefined> {
    const [label] = await db
      .select()
      .from(customLabels)
      .where(eq(customLabels.id, id));
    return label;
  }

  async createCustomLabel(label: InsertCustomLabel): Promise<CustomLabel> {
    const [newLabel] = await db
      .insert(customLabels)
      .values(label)
      .returning();
    return newLabel;
  }

  async updateCustomLabel(id: number, data: Partial<CustomLabel>): Promise<CustomLabel | undefined> {
    const [updatedLabel] = await db
      .update(customLabels)
      .set(data)
      .where(eq(customLabels.id, id))
      .returning();
    return updatedLabel;
  }

  async deleteCustomLabel(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(customLabels)
      .where(eq(customLabels.id, id))
      .returning({ id: customLabels.id });
    return !!deleted;
  }

  // Post operations
  async getPosts(userId: number): Promise<Post[]> {
    return db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  }

  async getUpcomingPosts(userId: number): Promise<Post[]> {
    const now = new Date();
    return db
      .select()
      .from(posts)
      .where(and(
        eq(posts.userId, userId),
        eq(posts.status, 'scheduled'),
        gt(posts.scheduledFor, now)
      ))
      .orderBy(posts.scheduledFor)
      .limit(10);
  }
  
  async getAllPosts(): Promise<Post[]> {
    return db
      .select()
      .from(posts)
      .orderBy(desc(posts.createdAt));
  }
  
  async getScheduledPosts(): Promise<Post[]> {
    const now = new Date();
    return db
      .select()
      .from(posts)
      .where(and(
        eq(posts.status, 'scheduled'),
        gt(posts.scheduledFor, now)
      ))
      .orderBy(posts.scheduledFor);
  }
  
  async getFailedPosts(): Promise<Post[]> {
    return db
      .select()
      .from(posts)
      .where(eq(posts.status, 'failed'))
      .orderBy(desc(posts.createdAt));
  }
  
  async getOverduePosts(): Promise<Post[]> {
    const now = new Date();
    return db
      .select()
      .from(posts)
      .where(and(
        eq(posts.status, 'scheduled'),
        lt(posts.scheduledFor, now)
      ))
      .orderBy(posts.scheduledFor);
  }
  
  async getPostsByStatus(status: string): Promise<Post[]> {
    return db
      .select()
      .from(posts)
      .where(eq(posts.status, status))
      .orderBy(desc(posts.createdAt));
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id));
    return post;
  }

  async createPost(post: InsertPost): Promise<Post> {
    const [newPost] = await db
      .insert(posts)
      .values(post)
      .returning();
    return newPost;
  }

  async updatePost(id: number, data: Partial<Post>): Promise<Post | undefined> {
    const [updatedPost] = await db
      .update(posts)
      .set(data)
      .where(eq(posts.id, id))
      .returning();
    return updatedPost;
  }

  async deletePost(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(posts)
      .where(eq(posts.id, id))
      .returning({ id: posts.id });
    return !!deleted;
  }

  // Activity operations
  async getActivities(userId: number, limit: number = 10): Promise<Activity[]> {
    return db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit);
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const activityWithDefaults = {
      ...activity,
      userId: activity.userId || null
    };
    const [newActivity] = await db
      .insert(activities)
      .values(activityWithDefaults)
      .returning();
    return newActivity;
  }
}

// Memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private platformUsers: Map<number, PlatformUser>;
  private facebookAccounts: Map<number, FacebookAccount>;
  private googleSheetsIntegrations: Map<number, GoogleSheetsIntegration>;
  private customLabels: Map<number, CustomLabel>;
  private posts: Map<number, Post>;
  private activities: Map<number, Activity>;
  private currentIds: {
    users: number;
    platformUsers: number;
    facebookAccounts: number;
    googleSheetsIntegrations: number;
    customLabels: number;
    posts: number;
    activities: number;
  };

  constructor() {
    this.users = new Map();
    this.platformUsers = new Map();
    this.facebookAccounts = new Map();
    this.googleSheetsIntegrations = new Map();
    this.customLabels = new Map();
    this.posts = new Map();
    this.activities = new Map();
    this.currentIds = {
      users: 1,
      platformUsers: 1,
      facebookAccounts: 1,
      googleSheetsIntegrations: 1,
      customLabels: 1,
      posts: 1,
      activities: 1
    };

    // Add sample data for development
    this.createUser({ 
      username: "demo",
      password: "password",
      email: "demo@example.com",
      fullName: "Demo User" 
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUserByFacebookId(facebookId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.facebookId === facebookId
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...data };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Platform user operations (new authentication system)
  async getPlatformUser(id: number): Promise<PlatformUser | undefined> {
    return this.platformUsers.get(id);
  }

  async getPlatformUserByUsername(username: string): Promise<PlatformUser | undefined> {
    return Array.from(this.platformUsers.values()).find(
      (user) => user.username === username
    );
  }

  async getPlatformUserByEmail(email: string): Promise<PlatformUser | undefined> {
    return Array.from(this.platformUsers.values()).find(
      (user) => user.email === email
    );
  }

  async createPlatformUser(userData: InsertPlatformUser): Promise<PlatformUser> {
    const id = this.currentIds.platformUsers++;
    const now = new Date();
    const newUser: PlatformUser = { 
      ...userData, 
      id, 
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      username: userData.username || null,
      email: userData.email || null,
      role: userData.role || 'user',
      isActive: userData.isActive !== undefined ? userData.isActive : true
    };
    this.platformUsers.set(id, newUser);
    return newUser;
  }

  async updatePlatformUser(id: number, data: Partial<PlatformUser>): Promise<PlatformUser | undefined> {
    const user = this.platformUsers.get(id);
    if (!user) return undefined;
    
    const updatedUser = { 
      ...user, 
      ...data, 
      updatedAt: new Date() 
    };
    this.platformUsers.set(id, updatedUser);
    return updatedUser;
  }

  async updatePlatformUserLastLogin(id: number): Promise<void> {
    const user = this.platformUsers.get(id);
    if (user) {
      const updatedUser = { 
        ...user, 
        lastLoginAt: new Date() 
      };
      this.platformUsers.set(id, updatedUser);
    }
  }

  async getAllPlatformUsers(): Promise<PlatformUser[]> {
    return Array.from(this.platformUsers.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt: now,
      password: insertUser.password || null,
      fullName: insertUser.fullName || null,
      facebookId: insertUser.facebookId || null,
      facebookToken: insertUser.facebookToken || null
    };
    this.users.set(id, user);
    return user;
  }

  // Platform user operations
  async getPlatformUser(id: number): Promise<PlatformUser | undefined> {
    return this.platformUsers.get(id);
  }

  async getPlatformUserByUsername(username: string): Promise<PlatformUser | undefined> {
    return Array.from(this.platformUsers.values()).find(
      (user) => user.username === username,
    );
  }

  async getPlatformUserByEmail(email: string): Promise<PlatformUser | undefined> {
    return Array.from(this.platformUsers.values()).find(
      (user) => user.email === email,
    );
  }

  async createPlatformUser(userData: InsertPlatformUser): Promise<PlatformUser> {
    const id = this.currentIds.platformUsers++;
    const now = new Date();
    const user: PlatformUser = { 
      ...userData, 
      id, 
      createdAt: now,
      updatedAt: now,
      role: userData.role || "user",
      isActive: true,
      lastLoginAt: null
    };
    this.platformUsers.set(id, user);
    return user;
  }

  async updatePlatformUser(id: number, data: Partial<PlatformUser>): Promise<PlatformUser | undefined> {
    const user = this.platformUsers.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...data, updatedAt: new Date() };
    this.platformUsers.set(id, updatedUser);
    return updatedUser;
  }

  async updatePlatformUserLastLogin(id: number): Promise<void> {
    const user = this.platformUsers.get(id);
    if (user) {
      user.lastLoginAt = new Date();
      this.platformUsers.set(id, user);
    }
  }

  async getAllPlatformUsers(): Promise<PlatformUser[]> {
    return Array.from(this.platformUsers.values());
  }

  // Facebook account operations
  async getFacebookAccounts(userId: number): Promise<FacebookAccount[]> {
    return Array.from(this.facebookAccounts.values()).filter(
      (account) => account.userId === userId
    );
  }

  async getFacebookAccount(id: number): Promise<FacebookAccount | undefined> {
    return this.facebookAccounts.get(id);
  }
  
  async getFacebookAccountByPageId(pageId: string): Promise<FacebookAccount | undefined> {
    return Array.from(this.facebookAccounts.values()).find(
      (account) => account.pageId === pageId
    );
  }

  async createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount> {
    const id = this.currentIds.facebookAccounts++;
    const now = new Date();
    const newAccount: FacebookAccount = { 
      ...account, 
      id, 
      createdAt: now,
      userId: account.userId || null,
      isActive: account.isActive !== false
    };
    this.facebookAccounts.set(id, newAccount);
    return newAccount;
  }

  async updateFacebookAccount(id: number, data: Partial<FacebookAccount>): Promise<FacebookAccount | undefined> {
    const account = this.facebookAccounts.get(id);
    if (!account) return undefined;
    
    const updatedAccount = { ...account, ...data };
    this.facebookAccounts.set(id, updatedAccount);
    return updatedAccount;
  }

  async deleteFacebookAccount(id: number): Promise<boolean> {
    return this.facebookAccounts.delete(id);
  }

  // Asana integration operations
  async getGoogleSheetsIntegration(userId: number): Promise<GoogleSheetsIntegration | undefined> {
    return Array.from(this.googleSheetsIntegrations.values()).find(
      (integration) => integration.userId === userId
    );
  }

  async createGoogleSheetsIntegration(integration: InsertGoogleSheetsIntegration): Promise<GoogleSheetsIntegration> {
    const id = this.currentIds.googleSheetsIntegrations++;
    const now = new Date();
    const newIntegration: GoogleSheetsIntegration = { 
      ...integration, 
      id, 
      createdAt: now,
      userId: integration.userId || null,
      refreshToken: integration.refreshToken || null,
      folderId: integration.folderId || null,
      spreadsheetId: integration.spreadsheetId || null
    };
    this.googleSheetsIntegrations.set(id, newIntegration);
    return newIntegration;
  }

  async updateGoogleSheetsIntegration(userId: number, data: Partial<GoogleSheetsIntegration>): Promise<GoogleSheetsIntegration | undefined> {
    const integration = Array.from(this.googleSheetsIntegrations.values()).find(
      (integration) => integration.userId === userId
    );
    
    if (!integration) return undefined;
    
    const updatedIntegration = { ...integration, ...data };
    this.googleSheetsIntegrations.set(integration.id, updatedIntegration);
    return updatedIntegration;
  }

  async createOrUpdateGoogleSheetsIntegration(data: InsertGoogleSheetsIntegration): Promise<GoogleSheetsIntegration> {
    // Check if integration exists
    const existing = await this.getGoogleSheetsIntegration(data.userId!);
    
    if (existing) {
      // Update existing integration
      const updated = await this.updateGoogleSheetsIntegration(data.userId!, data);
      return updated!;
    } else {
      // Create new integration
      return await this.createGoogleSheetsIntegration(data);
    }
  }

  // Custom label operations
  async getCustomLabels(userId: number): Promise<CustomLabel[]> {
    return Array.from(this.customLabels.values()).filter(
      (label) => label.userId === userId
    );
  }

  async getCustomLabel(id: number): Promise<CustomLabel | undefined> {
    return this.customLabels.get(id);
  }

  async createCustomLabel(label: InsertCustomLabel): Promise<CustomLabel> {
    const id = this.currentIds.customLabels++;
    const now = new Date();
    const newLabel: CustomLabel = { 
      ...label, 
      id, 
      createdAt: now,
      userId: label.userId || null
    };
    this.customLabels.set(id, newLabel);
    return newLabel;
  }

  async updateCustomLabel(id: number, data: Partial<CustomLabel>): Promise<CustomLabel | undefined> {
    const label = this.customLabels.get(id);
    if (!label) return undefined;
    
    const updatedLabel = { ...label, ...data };
    this.customLabels.set(id, updatedLabel);
    return updatedLabel;
  }

  async deleteCustomLabel(id: number): Promise<boolean> {
    return this.customLabels.delete(id);
  }

  // Post operations
  async getPosts(userId: number): Promise<Post[]> {
    return Array.from(this.posts.values()).filter(
      (post) => post.userId === userId
    );
  }

  async getUpcomingPosts(userId: number): Promise<Post[]> {
    const now = new Date();
    return Array.from(this.posts.values()).filter(
      (post) => post.userId === userId && 
                post.scheduledFor && 
                post.scheduledFor > now &&
                post.status !== 'published'
    ).sort((a, b) => {
      if (!a.scheduledFor || !b.scheduledFor) return 0;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
  }
  
  async getAllPosts(): Promise<Post[]> {
    return Array.from(this.posts.values());
  }
  
  async getScheduledPosts(): Promise<Post[]> {
    const now = new Date();
    return Array.from(this.posts.values()).filter(
      (post) => post.status === 'scheduled' && 
                post.scheduledFor && 
                post.scheduledFor > now
    ).sort((a, b) => {
      if (!a.scheduledFor || !b.scheduledFor) return 0;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
  }
  
  async getFailedPosts(): Promise<Post[]> {
    return Array.from(this.posts.values()).filter(
      (post) => post.status === 'failed'
    );
  }
  
  async getOverduePosts(): Promise<Post[]> {
    const now = new Date();
    return Array.from(this.posts.values()).filter(
      (post) => post.status === 'scheduled' && 
                post.scheduledFor && 
                post.scheduledFor < now
    ).sort((a, b) => {
      if (!a.scheduledFor || !b.scheduledFor) return 0;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });
  }
  
  async getPostsByStatus(status: string): Promise<Post[]> {
    return Array.from(this.posts.values()).filter(
      (post) => post.status === status
    );
  }

  async getPost(id: number): Promise<Post | undefined> {
    return this.posts.get(id);
  }

  async createPost(post: InsertPost): Promise<Post> {
    const id = this.currentIds.posts++;
    const now = new Date();
    const newPost: Post = { 
      ...post, 
      id, 
      createdAt: now,
      link: post.link || null,
      userId: post.userId || null,
      accountId: post.accountId || null,
      scheduledByUserId: post.scheduledByUserId || null,
      mediaUrl: post.mediaUrl || null,
      mediaType: post.mediaType || null,
      labels: post.labels || null,
      language: post.language || null,
      scheduledFor: post.scheduledFor || null,
      publishedAt: post.publishedAt || null,
      sheetRowId: post.sheetRowId || null,
      errorMessage: post.errorMessage || null
    };
    this.posts.set(id, newPost);
    return newPost;
  }

  async updatePost(id: number, data: Partial<Post>): Promise<Post | undefined> {
    const post = this.posts.get(id);
    if (!post) return undefined;
    
    const updatedPost = { ...post, ...data };
    this.posts.set(id, updatedPost);
    return updatedPost;
  }

  async deletePost(id: number): Promise<boolean> {
    return this.posts.delete(id);
  }

  // Activity operations
  async getActivities(userId: number, limit?: number): Promise<Activity[]> {
    const activities = Array.from(this.activities.values())
      .filter((activity) => activity.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    
    return limit ? activities.slice(0, limit) : activities;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = this.currentIds.activities++;
    const now = new Date();
    const newActivity: Activity = { 
      ...activity, 
      id, 
      createdAt: now,
      userId: activity.userId || null,
      metadata: activity.metadata || null
    };
    this.activities.set(id, newActivity);
    return newActivity;
  }
}

// Export storage instance
export const storage = new DatabaseStorage();
