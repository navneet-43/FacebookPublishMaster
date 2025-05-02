import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
});

// Facebook accounts model
export const facebookAccounts = pgTable("facebook_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  accountId: text("account_id").notNull(),
  pageId: text("page_id").notNull(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFacebookAccountSchema = createInsertSchema(facebookAccounts).pick({
  userId: true,
  name: true, 
  accountId: true,
  pageId: true,
  accessToken: true,
  isActive: true,
});

// Asana integration model
export const asanaIntegrations = pgTable("asana_integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAsanaIntegrationSchema = createInsertSchema(asanaIntegrations).pick({
  userId: true,
  accessToken: true,
  refreshToken: true,
  workspaceId: true,
  projectId: true,
});

// Custom labels model
export const customLabels = pgTable("custom_labels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomLabelSchema = createInsertSchema(customLabels).pick({
  userId: true,
  name: true,
  color: true,
});

// Posts model
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  accountId: integer("account_id").references(() => facebookAccounts.id),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  link: text("link"),
  labels: json("labels").$type<string[]>().default([]),
  language: text("language").default("English"),
  scheduledFor: timestamp("scheduled_for"),
  publishedAt: timestamp("published_at"),
  status: text("status").notNull().default("draft"),
  asanaTaskId: text("asana_task_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostSchema = createInsertSchema(posts).pick({
  userId: true,
  accountId: true,
  content: true,
  mediaUrl: true,
  link: true,
  labels: true,
  language: true,
  scheduledFor: true,
  status: true,
  asanaTaskId: true,
});

// Activities model
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  type: text("type").notNull(),
  description: text("description").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activities).pick({
  userId: true,
  type: true,
  description: true,
  metadata: true,
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  facebookAccounts: many(facebookAccounts),
  asanaIntegrations: many(asanaIntegrations),
  customLabels: many(customLabels),
  posts: many(posts),
  activities: many(activities),
}));

export const facebookAccountsRelations = relations(facebookAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [facebookAccounts.userId],
    references: [users.id],
  }),
  posts: many(posts),
}));

export const asanaIntegrationsRelations = relations(asanaIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [asanaIntegrations.userId],
    references: [users.id],
  }),
}));

export const customLabelsRelations = relations(customLabels, ({ one }) => ({
  user: one(users, {
    fields: [customLabels.userId],
    references: [users.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  facebookAccount: one(facebookAccounts, {
    fields: [posts.accountId],
    references: [facebookAccounts.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, {
    fields: [activities.userId],
    references: [users.id],
  }),
}));

// Export all types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type FacebookAccount = typeof facebookAccounts.$inferSelect;
export type InsertFacebookAccount = z.infer<typeof insertFacebookAccountSchema>;

export type AsanaIntegration = typeof asanaIntegrations.$inferSelect;
export type InsertAsanaIntegration = z.infer<typeof insertAsanaIntegrationSchema>;

export type CustomLabel = typeof customLabels.$inferSelect;
export type InsertCustomLabel = z.infer<typeof insertCustomLabelSchema>;

export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
