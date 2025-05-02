import {
  User, InsertUser, users,
  FacebookAccount, InsertFacebookAccount, facebookAccounts,
  AsanaIntegration, InsertAsanaIntegration, asanaIntegrations,
  CustomLabel, InsertCustomLabel, customLabels,
  Post, InsertPost, posts,
  Activity, InsertActivity, activities
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, lt, gt, isNull } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Facebook account operations
  getFacebookAccounts(userId: number): Promise<FacebookAccount[]>;
  getFacebookAccount(id: number): Promise<FacebookAccount | undefined>;
  createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount>;
  updateFacebookAccount(id: number, data: Partial<FacebookAccount>): Promise<FacebookAccount | undefined>;
  deleteFacebookAccount(id: number): Promise<boolean>;

  // Asana integration operations
  getAsanaIntegration(userId: number): Promise<AsanaIntegration | undefined>;
  createAsanaIntegration(integration: InsertAsanaIntegration): Promise<AsanaIntegration>;
  updateAsanaIntegration(userId: number, data: Partial<AsanaIntegration>): Promise<AsanaIntegration | undefined>;

  // Custom label operations
  getCustomLabels(userId: number): Promise<CustomLabel[]>;
  getCustomLabel(id: number): Promise<CustomLabel | undefined>;
  createCustomLabel(label: InsertCustomLabel): Promise<CustomLabel>;
  updateCustomLabel(id: number, data: Partial<CustomLabel>): Promise<CustomLabel | undefined>;
  deleteCustomLabel(id: number): Promise<boolean>;

  // Post operations
  getPosts(userId: number): Promise<Post[]>;
  getUpcomingPosts(userId: number): Promise<Post[]>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Facebook account operations
  async getFacebookAccounts(userId: number): Promise<FacebookAccount[]> {
    return db.select().from(facebookAccounts).where(eq(facebookAccounts.userId, userId));
  }

  async getFacebookAccount(id: number): Promise<FacebookAccount | undefined> {
    const [account] = await db.select().from(facebookAccounts).where(eq(facebookAccounts.id, id));
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

  // Asana integration operations
  async getAsanaIntegration(userId: number): Promise<AsanaIntegration | undefined> {
    const [integration] = await db
      .select()
      .from(asanaIntegrations)
      .where(eq(asanaIntegrations.userId, userId));
    return integration;
  }

  async createAsanaIntegration(integration: InsertAsanaIntegration): Promise<AsanaIntegration> {
    const [newIntegration] = await db
      .insert(asanaIntegrations)
      .values(integration)
      .returning();
    return newIntegration;
  }

  async updateAsanaIntegration(userId: number, data: Partial<AsanaIntegration>): Promise<AsanaIntegration | undefined> {
    const [updatedIntegration] = await db
      .update(asanaIntegrations)
      .set(data)
      .where(eq(asanaIntegrations.userId, userId))
      .returning();
    return updatedIntegration;
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
    const [newActivity] = await db
      .insert(activities)
      .values(activity)
      .returning();
    return newActivity;
  }
}

// Memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private facebookAccounts: Map<number, FacebookAccount>;
  private asanaIntegrations: Map<number, AsanaIntegration>;
  private customLabels: Map<number, CustomLabel>;
  private posts: Map<number, Post>;
  private activities: Map<number, Activity>;
  private currentIds: {
    users: number;
    facebookAccounts: number;
    asanaIntegrations: number;
    customLabels: number;
    posts: number;
    activities: number;
  };

  constructor() {
    this.users = new Map();
    this.facebookAccounts = new Map();
    this.asanaIntegrations = new Map();
    this.customLabels = new Map();
    this.posts = new Map();
    this.activities = new Map();
    this.currentIds = {
      users: 1,
      facebookAccounts: 1,
      asanaIntegrations: 1,
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const now = new Date();
    const user: User = { ...insertUser, id, createdAt: now };
    this.users.set(id, user);
    return user;
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

  async createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount> {
    const id = this.currentIds.facebookAccounts++;
    const now = new Date();
    const newAccount: FacebookAccount = { ...account, id, createdAt: now };
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
  async getAsanaIntegration(userId: number): Promise<AsanaIntegration | undefined> {
    return Array.from(this.asanaIntegrations.values()).find(
      (integration) => integration.userId === userId
    );
  }

  async createAsanaIntegration(integration: InsertAsanaIntegration): Promise<AsanaIntegration> {
    const id = this.currentIds.asanaIntegrations++;
    const now = new Date();
    const newIntegration: AsanaIntegration = { ...integration, id, createdAt: now };
    this.asanaIntegrations.set(id, newIntegration);
    return newIntegration;
  }

  async updateAsanaIntegration(userId: number, data: Partial<AsanaIntegration>): Promise<AsanaIntegration | undefined> {
    const integration = Array.from(this.asanaIntegrations.values()).find(
      (integration) => integration.userId === userId
    );
    
    if (!integration) return undefined;
    
    const updatedIntegration = { ...integration, ...data };
    this.asanaIntegrations.set(integration.id, updatedIntegration);
    return updatedIntegration;
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
    const newLabel: CustomLabel = { ...label, id, createdAt: now };
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

  async getPost(id: number): Promise<Post | undefined> {
    return this.posts.get(id);
  }

  async createPost(post: InsertPost): Promise<Post> {
    const id = this.currentIds.posts++;
    const now = new Date();
    const newPost: Post = { ...post, id, createdAt: now };
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
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return limit ? activities.slice(0, limit) : activities;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = this.currentIds.activities++;
    const now = new Date();
    const newActivity: Activity = { ...activity, id, createdAt: now };
    this.activities.set(id, newActivity);
    return newActivity;
  }
}

// Export storage instance
export const storage = new DatabaseStorage();
