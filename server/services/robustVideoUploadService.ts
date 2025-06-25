import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';
import { existsSync, statSync } from 'fs';

/**
 * Robust video upload service that handles Facebook API timeouts and issues
 */
export class RobustVideoUploadService {
  
  /**
   * Upload video with multiple fallback strategies
   */
  static async uploadWithFallbacks(
    pageId: string,
    pageAccessToken: string,
    filePath: string,
    description?: string,
    customLabels?: string[],
    language?: string
  ): Promise<{
    success: boolean;
    postId?: string;
    method?: string;
    error?: string;
  }> {
    console.log('🔄 Starting robust video upload with fallbacks');
    
    if (!existsSync(filePath)) {
      return { success: false, error: 'Video file not found' };
    }
    
    const stats = statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`📊 File size: ${fileSizeMB.toFixed(2)}MB`);
    
    // Strategy 1: Direct file upload with timeout handling
    console.log('📤 Strategy 1: Direct upload with timeout protection');
    try {
      const directResult = await this.uploadWithTimeout(
        pageId, pageAccessToken, filePath, description, customLabels, language, 30000
      );
      
      if (directResult.success) {
        console.log('✅ Direct upload successful');
        return { ...directResult, method: 'direct' };
      }
      
      console.log('❌ Direct upload failed:', directResult.error);
    } catch (error) {
      console.log('❌ Direct upload error:', error);
    }
    
    // Strategy 2: Text post with video link (immediate fallback)
    console.log('📝 Strategy 2: Text post fallback (reliable)');
    try {
      const textResult = await HootsuiteStyleFacebookService.publishTextPost(
        pageId,
        pageAccessToken,
        `${description || 'Video content'}\n\nNote: Video file available for direct upload if needed.`,
        undefined,
        customLabels,
        language
      );
      
      if (textResult.success) {
        console.log('✅ Text post published successfully');
        return { 
          ...textResult, 
          method: 'text_fallback',
          error: 'Video upload timeout - posted as text. Video file is ready for manual upload.'
        };
      }
    } catch (error) {
      console.log('❌ Text post fallback failed:', error);
    }
    
    // Strategy 3: Chunked upload (for persistent issues)
    console.log('🔄 Strategy 3: Chunked upload attempt');
    try {
      const chunkedResult = await this.uploadChunkedWithTimeout(
        pageId, pageAccessToken, filePath, description, customLabels, language, 45000
      );
      
      if (chunkedResult.success) {
        console.log('✅ Chunked upload successful');
        return { ...chunkedResult, method: 'chunked' };
      }
      
      console.log('❌ Chunked upload failed:', chunkedResult.error);
    } catch (error) {
      console.log('❌ Chunked upload error:', error);
    }
    
    return {
      success: false,
      error: 'All upload strategies failed. Facebook API may be experiencing issues.'
    };
  }
  
  /**
   * Upload with specific timeout
   */
  private static async uploadWithTimeout(
    pageId: string,
    pageAccessToken: string,
    filePath: string,
    description?: string,
    customLabels?: string[],
    language?: string,
    timeoutMs: number = 30000
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    const uploadPromise = HootsuiteStyleFacebookService.uploadVideoFile(
      pageId, pageAccessToken, filePath, description, customLabels, language
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Upload timeout')), timeoutMs);
    });
    
    return await Promise.race([uploadPromise, timeoutPromise]);
  }
  
  /**
   * Chunked upload with timeout
   */
  private static async uploadChunkedWithTimeout(
    pageId: string,
    pageAccessToken: string,
    filePath: string,
    description?: string,
    customLabels?: string[],
    language?: string,
    timeoutMs: number = 45000
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    const uploadPromise = HootsuiteStyleFacebookService.uploadLargeVideoFileChunked(
      pageId, pageAccessToken, filePath, description, customLabels, language
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Chunked upload timeout')), timeoutMs);
    });
    
    return await Promise.race([uploadPromise, timeoutPromise]);
  }
  
  /**
   * Validate Facebook API connectivity
   */
  static async validateFacebookAPI(pageId: string, pageAccessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}?access_token=${pageAccessToken}`);
      const data = await response.json();
      
      return response.ok && !data.error;
    } catch (error) {
      console.log('Facebook API validation failed:', error);
      return false;
    }
  }
}