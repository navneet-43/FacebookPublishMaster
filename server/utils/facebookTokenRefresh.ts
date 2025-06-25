import { storage } from '../storage';
import { HootsuiteStyleFacebookService } from '../services/hootsuiteStyleFacebookService';

/**
 * Utility to refresh Facebook access tokens
 */
export async function refreshFacebookTokens() {
  console.log('🔄 Refreshing Facebook access tokens...');
  
  try {
    const accounts = await storage.getFacebookAccounts(3);
    
    if (accounts.length === 0) {
      console.log('❌ No Facebook accounts found to refresh');
      return;
    }
    
    for (const account of accounts) {
      console.log(`\n🔍 Checking account: ${account.name} (${account.pageId})`);
      
      // Test current token validity
      const isValid = await HootsuiteStyleFacebookService.validatePageToken(account.pageId, account.accessToken);
      
      if (isValid) {
        console.log('✅ Token is still valid');
        continue;
      }
      
      console.log('❌ Token is invalid or expired');
      console.log('⚠️ Manual token refresh required');
      console.log('📋 Steps to refresh:');
      console.log('1. Go to Facebook Page Settings');
      console.log('2. Generate new Page Access Token');
      console.log('3. Update token in the database');
      console.log(`4. Current token preview: ${account.accessToken.substring(0, 20)}...`);
    }
    
  } catch (error) {
    console.error('❌ Error refreshing tokens:', error);
  }
}

/**
 * Check if Facebook tokens are valid
 */
export async function validateFacebookTokens(): Promise<boolean> {
  try {
    const accounts = await storage.getFacebookAccounts(3);
    
    if (accounts.length === 0) {
      console.log('❌ No Facebook accounts configured');
      return false;
    }
    
    let allValid = true;
    
    for (const account of accounts) {
      const isValid = await HootsuiteStyleFacebookService.validatePageToken(account.pageId, account.accessToken);
      
      if (!isValid) {
        console.log(`❌ Invalid token for ${account.name}`);
        allValid = false;
      } else {
        console.log(`✅ Valid token for ${account.name}`);
      }
    }
    
    return allValid;
  } catch (error) {
    console.error('❌ Error validating tokens:', error);
    return false;
  }
}