/**
 * Keep Alive Service
 * Prevents Replit server sleep by maintaining activity
 */

import fetch from 'node-fetch';

export class KeepAliveService {
  private static pingInterval: NodeJS.Timeout | null = null;
  private static healthInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize keep-alive service
   */
  static async initialize(): Promise<void> {
    console.log('🔄 INITIALIZING KEEP-ALIVE SERVICE...');
    
    // Get the Replit domain for self-pinging
    const replitDomain = process.env.REPLIT_DOMAINS;
    if (!replitDomain) {
      console.log('⚠️ REPLIT_DOMAINS not found - using localhost for keep-alive');
    }
    
    const baseUrl = replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
    
    // Self-ping every 5 minutes to prevent sleep
    this.pingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${baseUrl}/api/health`, {
          method: 'GET'
        });
        
        if (response.ok) {
          console.log('🏓 Keep-alive ping successful');
        } else {
          console.log('⚠️ Keep-alive ping failed:', response.status);
        }
      } catch (error) {
        console.log('⚠️ Keep-alive ping error:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Additional health check every 2 minutes
    this.healthInterval = setInterval(async () => {
      try {
        const response = await fetch(`${baseUrl}/api/scheduling-status`, {
          method: 'GET'
        });
        
        if (response.ok) {
          console.log('💚 Health check passed');
        }
      } catch (error) {
        console.log('⚠️ Health check failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 2 * 60 * 1000); // Every 2 minutes
    
    console.log('✅ KEEP-ALIVE SERVICE INITIALIZED - Pinging every 5 minutes');
  }

  /**
   * Shutdown keep-alive service
   */
  static shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    
    console.log('🛑 KEEP-ALIVE SERVICE SHUTDOWN');
  }

  /**
   * Manual ping trigger
   */
  static async ping(): Promise<boolean> {
    try {
      const replitDomain = process.env.REPLIT_DOMAINS;
      const baseUrl = replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
      
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET'
      });
      
      return response.ok;
    } catch (error) {
      console.error('Manual ping failed:', error);
      return false;
    }
  }
}