import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { User } from '@shared/schema';

interface FacebookProfile {
  id: string;
  displayName: string;
  emails?: Array<{value: string}>;
}

// Set up Facebook authentication strategy
export function setupAuth() {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || '',
    clientSecret: process.env.FACEBOOK_APP_SECRET || '',
    callbackURL: `https://workspace.RumbleQuiz.repl.co/auth/facebook/callback`,
    profileFields: ['id', 'displayName', 'email'],
    // Permissions are set in the Facebook Developer Portal, not here
  }, async (accessToken: string, refreshToken: string, profile: FacebookProfile, done: Function) => {
    try {
      // Check if user exists in database
      let user = await storage.getUserByFacebookId(profile.id);
      
      if (!user) {
        // Create a new user with Facebook profile info
        user = await storage.createUser({
          username: profile.displayName || `fb_${profile.id}`,
          email: profile.emails?.[0]?.value || `${profile.id}@facebook.com`,
          facebookId: profile.id,
          facebookToken: accessToken
        });
      } else {
        // Update the user's Facebook token
        await storage.updateUser(user.id, {
          facebookToken: accessToken
        });
      }
      
      // After successful login, fetch user's Facebook pages
      await fetchUserPages(user.id, accessToken);
      
      return done(null, user);
    } catch (error) {
      return done(error as Error);
    }
  }));

  // Serialization for session storage
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

// Middleware to check if user is authenticated
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
}

interface FacebookPageData {
  id: string;
  name: string;
  access_token: string;
}

interface FacebookPagesResponse {
  data?: FacebookPageData[];
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

// Function to fetch user's Facebook pages
export async function fetchUserPages(userId: number, accessToken: string): Promise<FacebookPageData[]> {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
    const data = await response.json() as FacebookPagesResponse;
    
    if (data.error) {
      console.error('Error fetching Facebook pages:', data.error);
      return [];
    }
    
    if (data.data && Array.isArray(data.data)) {
      // Process each Facebook page
      for (const page of data.data) {
        // Check if the page already exists in our database
        const existingAccount = await storage.getFacebookAccountByPageId(page.id);
        
        if (!existingAccount) {
          // Create a new account with the page data
          await storage.createFacebookAccount({
            userId,
            name: page.name,
            pageId: page.id,
            accessToken: page.access_token,
            isActive: true
          });
        } else if (existingAccount.userId === userId) {
          // Update the existing account
          await storage.updateFacebookAccount(existingAccount.id, {
            accessToken: page.access_token,
            isActive: true
          });
        }
      }
      
      // Return the pages data
      return data.data;
    }
    
    return [];
  } catch (error) {
    console.error('Error processing Facebook pages:', error);
    return [];
  }
}

// Function to get user's Facebook pages (can be used by API routes)
export async function getUserPages(userId: number) {
  try {
    const accounts = await storage.getFacebookAccounts(userId);
    return accounts;
  } catch (error) {
    console.error('Error getting user Facebook pages:', error);
    return [];
  }
}