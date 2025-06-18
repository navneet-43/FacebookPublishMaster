import fetch from 'node-fetch';
import { storage } from '../storage';

interface FacebookPageInfo {
  id: string;
  name: string;
  access_token: string;
  perms: string[];
}

interface FacebookPagesResponse {
  data: FacebookPageInfo[];
  paging?: {
    next?: string;
    previous?: string;
  };
}

/**
 * Hootsuite-style Facebook service for publishing content
 * Uses Facebook Business API with proper long-lived tokens
 */
export class HootsuiteStyleFacebookService {
  
  /**
   * Get long-lived user access token (60 days validity)
   */
  static async getLongLivedUserToken(shortLivedToken: string): Promise<string | null> {
    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      
      if (!appId || !appSecret) {
        console.error('Facebook app credentials missing');
        return null;
      }

      const url = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Failed to get long-lived token:', data.error);
        return null;
      }
      
      return data.access_token;
    } catch (error) {
      console.error('Error getting long-lived token:', error);
      return null;
    }
  }

  /**
   * Get user's managed pages with permanent page access tokens
   */
  static async getUserManagedPages(userAccessToken: string): Promise<FacebookPageInfo[]> {
    try {
      // Updated API call without deprecated 'perms' field
      const url = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (!response.ok || !data.data) {
        console.error('Failed to fetch pages:', data);
        return [];
      }
      
      console.log(`✅ Successfully fetched ${data.data.length} Facebook pages`);
      
      // Return all pages since we can't check permissions directly anymore
      // Facebook will reject publishing attempts if no permissions exist
      return data.data.map((page: any) => ({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        perms: [] // Empty array since perms field is deprecated
      }));
    } catch (error) {
      console.error('Error fetching user pages:', error);
      return [];
    }
  }

  /**
   * Publish text post to Facebook page (Hootsuite style)
   */
  static async publishTextPost(pageId: string, pageAccessToken: string, message: string, link?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
      
      const postData = new URLSearchParams();
      postData.append('message', message);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as JSON array for insights reporting
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook text post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      if (link) {
        postData.append('link', link);
      }
      
      console.log(`Publishing text post to page ${pageId}`);
      console.log('Post data being sent:', Object.fromEntries(postData.entries()));
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      console.log('Facebook API response:', data);
      
      if (!response.ok || data.error) {
        console.error('Facebook publishing error:', data.error);
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing text post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish photo post to Facebook page (supports Google Drive links)
   */
  static async publishPhotoPost(pageId: string, pageAccessToken: string, photoUrl: string, caption?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      const { convertGoogleDriveLink, isGoogleDriveLink } = await import('../utils/googleDriveConverter');
      
      let finalPhotoUrl = photoUrl;
      
      // Convert Google Drive links to direct download URLs
      if (isGoogleDriveLink(photoUrl)) {
        const convertedUrl = convertGoogleDriveLink(photoUrl);
        if (convertedUrl) {
          finalPhotoUrl = convertedUrl;
          console.log('Converted Google Drive link for Facebook:', finalPhotoUrl);
        } else {
          return {
            success: false,
            error: 'Invalid Google Drive link format'
          };
        }
      }
      
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/photos`;
      
      const postData = new URLSearchParams();
      postData.append('url', finalPhotoUrl);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      if (caption) {
        postData.append('caption', caption);
      }
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as JSON array for insights reporting
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook photo post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing photo post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook photo publishing error:', data.error);
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published photo post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing photo post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish video post to Facebook page (supports Google Drive links)
   */
  static async publishVideoPost(pageId: string, pageAccessToken: string, videoUrl: string, description?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      console.log('🎬 PROCESSING VIDEO for Facebook upload:', videoUrl);
      
      // Validate against Facebook Graph API requirements
      const { FacebookVideoValidator } = await import('./facebookVideoValidator');
      const fbValidation = await FacebookVideoValidator.validateForFacebook(videoUrl);
      
      if (!fbValidation.isValid) {
        console.error('❌ FACEBOOK VALIDATION FAILED:', fbValidation.violations);
        const report = FacebookVideoValidator.generateFacebookValidationReport(fbValidation);
        return {
          success: false,
          error: `Video does not meet Facebook requirements:\n\n${report}`
        };
      }
      
      console.log('✅ FACEBOOK VALIDATION PASSED:', fbValidation.uploadMethod, fbValidation.detectedFormat);
      
      // Force upload method based on Facebook validation
      const forcedUploadMethod = fbValidation.uploadMethod;
      
      const { VideoProcessor } = await import('./videoProcessor');
      
      // Process video for optimal Facebook compatibility
      const processingResult = await VideoProcessor.processVideo(videoUrl);
      
      if (!processingResult.success) {
        console.log('❌ VIDEO EXCEEDS 4GB LIMIT');
        return {
          success: false,
          error: processingResult.error || 'Video exceeds Facebook\'s 4GB limit'
        };
      }
      
      const finalVideoUrl = processingResult.processedUrl || videoUrl;
      
      if (processingResult.skipProcessing) {
        console.log('✅ VIDEO READY: No processing needed');
      } else {
        console.log('✅ VIDEO OPTIMIZED: Ready for Facebook upload');
        if (processingResult.originalSize) {
          const sizeMB = (processingResult.originalSize / 1024 / 1024).toFixed(2);
          console.log(`📊 VIDEO SIZE: ${sizeMB}MB (proceeding with upload)`);
        }
      }
      
      // Use upload method determined by Facebook validation
      if (forcedUploadMethod === 'resumable') {
        console.log('🚀 USING RESUMABLE UPLOAD per Facebook requirements');
        return await HootsuiteStyleFacebookService.uploadLargeVideoResumable(pageId, pageAccessToken, finalVideoUrl, description, customLabels, language);
      } else if (forcedUploadMethod === 'file_url') {
        console.log('📤 USING FILE_URL UPLOAD per Facebook requirements');
        // Continue with standard file_url method
      } else {
        console.log('🚫 UPLOAD REJECTED by Facebook validation');
        return {
          success: false,
          error: 'Video rejected by Facebook validation'
        };
      }
      
      // For other videos, use resumable upload if they're large
      const shouldUseResumableUpload = processingResult.originalSize && processingResult.originalSize > 50 * 1024 * 1024; // 50MB threshold
      
      if (shouldUseResumableUpload) {
        console.log('🚀 USING RESUMABLE UPLOAD for large video');
        return await HootsuiteStyleFacebookService.uploadLargeVideoResumable(pageId, pageAccessToken, finalVideoUrl, description, customLabels, language);
      }
      
      const endpoint = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const postData = new URLSearchParams();
      postData.append('file_url', finalVideoUrl);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      if (description) {
        postData.append('description', description);
      }
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        // Facebook expects custom labels as JSON array for insights reporting
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook video post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing video post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook video publishing error:', data.error);
        
        // Check if it's a media-related error that can be handled with fallback
        const isMediaError = data.error?.code === 351 || 
                            data.error?.message?.includes('video file') ||
                            data.error?.message?.includes('corrupt') ||
                            data.error?.message?.includes('unreadable');
        
        if (isMediaError) {
          console.log('❌ VIDEO UPLOAD FAILED: Facebook rejected the video file');
          
          // Provide specific guidance based on video source
          if (videoUrl.includes('drive.google.com')) {
            console.log('🔍 GOOGLE DRIVE VIDEO UPLOAD FAILED');
            
            return {
              success: false,
              error: `Google Drive Video Upload Failed

Google Drive blocks programmatic video access due to security policies.

RECOMMENDED SOLUTION - Switch to Dropbox:

1. **Upload to Dropbox**:
   • Upload your video to Dropbox
   • Right-click → Share → "Anyone with the link"
   • Copy the sharing link

2. **Use Dropbox Link**:
   • Replace Google Drive URLs with Dropbox URLs in your Excel
   • System automatically converts to direct download format
   • Supports videos up to 4GB

3. **Alternative Options**:
   • Download and upload directly through this system
   • Use YouTube (unlisted) and share the link

Dropbox provides reliable programmatic access for automated video posting.`
            };
          }
          
          if (videoUrl.includes('dropbox.com')) {
            console.log('🔍 DROPBOX VIDEO UPLOAD FAILED');
            
            const { DropboxHelper } = await import('./dropboxHelper');
            
            return {
              success: false,
              error: `Dropbox Video Upload Failed

${DropboxHelper.getDropboxInstructions()}

TROUBLESHOOTING:
• Ensure video is fully uploaded to Dropbox
• Check that sharing is set to "Anyone with the link"
• Verify video format is supported (MP4, MOV, AVI)
• Try downloading and re-uploading if issues persist`
            };
          }
          

          
          // Fallback to general video solutions
          const { VideoSolutions } = await import('../utils/videoSolutions');
          
          // Determine error type and get appropriate solution
          let errorType: 'size' | 'format' | 'access' | 'corrupt' = 'access';
          if (data.error?.message?.includes('large')) {
            errorType = 'size';
          } else if (data.error?.message?.includes('format')) {
            errorType = 'format';
          }
          // Note: Don't treat 351 as size issue when original size is 0 or very small
          
          // Get estimated file size for solution recommendations
          const estimatedSize = processingResult.originalSize || 1; // Use minimal size for access issues
          const sizeMB = estimatedSize / 1024 / 1024;
          
          const detailedSolution = VideoSolutions.createSolutionMessage(sizeMB, errorType);
          
          return {
            success: false,
            error: detailedSolution
          };
        }
        
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published video post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing video post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Refresh all page tokens for a user (Hootsuite approach)
   */
  static async refreshUserPageTokens(userId: number, userAccessToken: string): Promise<void> {
    try {
      // Get long-lived user token first
      const longLivedUserToken = await this.getLongLivedUserToken(userAccessToken);
      if (!longLivedUserToken) {
        console.error('Failed to get long-lived user token');
        return;
      }

      // Get all managed pages with fresh tokens
      const pages = await this.getUserManagedPages(longLivedUserToken);
      
      // Update database with fresh page tokens
      for (const page of pages) {
        try {
          // Check if page already exists
          const existingAccounts = await storage.getFacebookAccounts(userId);
          const existingAccount = existingAccounts.find(acc => acc.pageId === page.id);
          
          if (existingAccount) {
            // Update existing account with fresh token
            await storage.updateFacebookAccount(existingAccount.id, {
              accessToken: page.access_token,
              name: page.name
            });
            console.log(`Updated token for existing page: ${page.name}`);
          } else {
            // Create new account entry
            await storage.createFacebookAccount({
              userId: userId,
              pageId: page.id,
              name: page.name,
              accessToken: page.access_token,
              isActive: true
            });
            console.log(`Added new page: ${page.name}`);
          }
        } catch (error) {
          console.error(`Error updating page ${page.name}:`, error);
        }
      }
      
      // Update user's token
      await storage.updateUser(userId, {
        facebookToken: longLivedUserToken
      });
      
      console.log(`Successfully refreshed tokens for user ${userId} - ${pages.length} pages updated`);
      
    } catch (error) {
      console.error('Error refreshing user page tokens:', error);
    }
  }

  /**
   * Validate page access token
   */
  static async validatePageToken(pageId: string, pageAccessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}?access_token=${pageAccessToken}`);
      const data = await response.json() as any;
      
      return response.ok && !data.error;
    } catch (error) {
      console.error('Error validating page token:', error);
      return false;
    }
  }

  /**
   * Get page publishing permissions
   */
  static async getPagePermissions(pageId: string, pageAccessToken: string): Promise<string[]> {
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=perms&access_token=${pageAccessToken}`);
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        return [];
      }
      
      return data.perms || [];
    } catch (error) {
      console.error('Error getting page permissions:', error);
      return [];
    }
  }

  /**
   * Upload large video using Facebook's resumable upload API
   */
  static async uploadLargeVideoResumable(pageId: string, pageAccessToken: string, videoUrl: string, description?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      // Step 1: Find working Google Drive URL and download video data
      console.log('📥 DOWNLOADING VIDEO DATA for resumable upload');
      
      // Convert cloud storage URLs to direct download format
      let workingUrl = videoUrl;
      
      if (videoUrl.includes('drive.google.com')) {
        const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          workingUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
          console.log('🔄 Converted Google Drive URL for direct download');
        }
      } else if (videoUrl.includes('dropbox.com')) {
        const { DropboxHelper } = await import('./dropboxHelper');
        workingUrl = DropboxHelper.convertToDirectUrl(videoUrl);
      }
      
      const videoResponse = await fetch(workingUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }
      
      const videoBuffer = await videoResponse.arrayBuffer();
      const videoSize = videoBuffer.byteLength;
      
      console.log(`📊 VIDEO DOWNLOADED: ${(videoSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Check if we actually got video data
      if (videoSize === 0) {
        throw new Error('Downloaded video file is empty (0 bytes). This indicates Google Drive access restrictions or the file may not be a video.');
      }
      
      // Check if we got HTML instead of video data
      const contentType = videoResponse.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Downloaded content is HTML instead of video data. Google Drive may be redirecting to a login page or the file is not publicly accessible.');
      }
      
      // Step 2: Initialize resumable upload session
      console.log('🚀 INITIALIZING RESUMABLE UPLOAD SESSION');
      
      const initEndpoint = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      const initData = new URLSearchParams();
      initData.append('upload_phase', 'start');
      initData.append('file_size', videoSize.toString());
      initData.append('access_token', pageAccessToken);
      
      const initResponse = await fetch(initEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: initData.toString()
      });
      
      const initResult = await initResponse.json() as any;
      
      if (!initResponse.ok || initResult.error) {
        throw new Error(`Upload initialization failed: ${initResult.error?.message || 'Unknown error'}`);
      }
      
      const sessionId = initResult.video_id;
      const uploadSessionId = initResult.upload_session_id;
      
      console.log(`✅ UPLOAD SESSION CREATED: ${sessionId}`);
      
      // Step 3: Upload video data in chunks
      console.log('📤 UPLOADING VIDEO DATA');
      
      const chunkSize = 8 * 1024 * 1024; // 8MB chunks
      const totalChunks = Math.ceil(videoSize / chunkSize);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, videoSize);
        const chunk = videoBuffer.slice(start, end);
        
        console.log(`📤 UPLOADING CHUNK ${i + 1}/${totalChunks} (${(chunk.byteLength / 1024 / 1024).toFixed(2)}MB)`);
        
        const uploadData = new FormData();
        uploadData.append('upload_phase', 'transfer');
        uploadData.append('start_offset', start.toString());
        uploadData.append('upload_session_id', uploadSessionId);
        uploadData.append('video_file_chunk', new Blob([chunk]), 'chunk.bin');
        uploadData.append('access_token', pageAccessToken);
        
        const uploadResponse = await fetch(initEndpoint, {
          method: 'POST',
          body: uploadData
        });
        
        const uploadResult = await uploadResponse.json() as any;
        
        if (!uploadResponse.ok || uploadResult.error) {
          throw new Error(`Chunk upload failed: ${uploadResult.error?.message || 'Unknown error'}`);
        }
      }
      
      // Step 4: Finalize upload with metadata
      console.log('🏁 FINALIZING VIDEO UPLOAD');
      
      const finalizeData = new URLSearchParams();
      finalizeData.append('upload_phase', 'finish');
      finalizeData.append('upload_session_id', uploadSessionId);
      finalizeData.append('access_token', pageAccessToken);
      finalizeData.append('published', 'true');
      
      if (description) {
        finalizeData.append('description', description);
      }
      
      // Add custom labels for Meta Insights
      if (customLabels && customLabels.length > 0) {
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25)
          .slice(0, 10);
        
        if (labelArray.length > 0) {
          finalizeData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to resumable video upload:', labelArray);
        }
      }
      
      if (language) {
        finalizeData.append('locale', language);
      }
      
      const finalizeResponse = await fetch(initEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: finalizeData.toString()
      });
      
      const finalResult = await finalizeResponse.json() as any;
      
      if (!finalizeResponse.ok || finalResult.error) {
        throw new Error(`Upload finalization failed: ${finalResult.error?.message || 'Unknown error'}`);
      }
      
      console.log('✅ RESUMABLE UPLOAD COMPLETED:', finalResult.id || sessionId);
      
      return {
        success: true,
        postId: finalResult.id || sessionId
      };
      
    } catch (error) {
      console.error('❌ RESUMABLE UPLOAD FAILED:', error);
      
      // Provide specific guidance for Google Drive access issues
      const errorMessage = error instanceof Error ? error.message : 'Resumable upload failed';
      
      if (errorMessage.includes('empty') || errorMessage.includes('0 bytes') || errorMessage.includes('HTML')) {
        return {
          success: false,
          error: `Google Drive Video Access Blocked

The video was uploaded to Facebook but contains no content (0 bytes) because Google Drive blocks direct programmatic access to video files.

WORKING SOLUTIONS:

1. **Download & Direct Upload** (Recommended):
   • Download video from Google Drive to your computer
   • Use the file upload feature in this system instead of URL
   • Guarantees full video content transfer

2. **Alternative Video Hosting**:
   • Upload to YouTube (set to unlisted)
   • Share YouTube link directly in Facebook posts
   • YouTube links work perfectly with Facebook

3. **Public Cloud Storage**:
   • Use Dropbox, OneDrive, or AWS S3 with public links
   • These services allow direct video access

Google Drive's security policies prevent external applications from downloading video content, even with public sharing enabled.`
        };
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}