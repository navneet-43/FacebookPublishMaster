// Re-export types from the shared schema
export interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  createdAt: Date;
}

export interface FacebookAccount {
  id: number;
  userId: number;
  name: string;
  accountId: string;
  pageId: string;
  accessToken: string;
  isActive: boolean;
  createdAt: Date;
}

export interface AsanaIntegration {
  id: number;
  userId: number;
  accessToken: string;
  refreshToken?: string;
  workspaceId?: string;
  projectId?: string;
  createdAt: Date;
}

export interface CustomLabel {
  id: number;
  userId: number;
  name: string;
  color: string;
  createdAt: Date;
}

export interface Post {
  id: number;
  userId: number;
  accountId: number;
  content: string;
  mediaUrl?: string;
  link?: string;
  labels?: string[];
  language: string;
  scheduledFor?: Date;
  publishedAt?: Date;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  asanaTaskId?: string;
  errorMessage?: string;
  createdAt: Date;
}

export interface Activity {
  id: number;
  userId: number;
  type: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// Application state types
export interface Stats {
  scheduled: number;
  publishedToday: number;
  accounts: number;
  failed: number;
}

export interface AsanaProject {
  id: string;
  name: string;
}

export interface AsanaTask {
  id: string;
  name: string;
  dueDate?: string;
  notes?: string;
  customFields?: Record<string, any>;
}

export interface FieldMapping {
  title: string;
  content: string;
  scheduledDate: string;
  labels: string;
  language: string;
}
