import fetch from 'node-fetch';
import { storage } from '../storage';
import { progressTracker } from './progressTrackingService';
import { Readable } from 'stream';

export interface TrueStreamingOptions {
  googleDriveUrl: string;
  accountId: number;
  userId: number;
  content?: string;
  customLabels?: string[];
  language?: string;
  uploadId?: string;
  isReel?: boolean;
}

export interface TrueStreamingResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  facebookUrl?: string;
  error?: string;
  method: 'true_chunked_streaming';
  sizeMB?: number;
}

export class TrueStreamingVideoUploadService {
  private static readonly CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
  private static readonly MAX_RETRIES = 3;

  /**
   * Extract Google Drive file ID from URL
   */
  private static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Get Google Drive direct download URL with confirmation bypass
   */
  private static getGoogleDriveUrl(fileId: string): string {
    return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  }

  /**
   * Get file metadata from Google Drive without downloading
   */
  private static async getFileMetadata(url: string): Promise<{ sizeMB: number; contentLength: number } | null> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      
      if (contentLength === 0) {
        // Try with GET to get redirect and actual size
        const getResponse = await fetch(url, { method: 'GET', redirect: 'manual' });
        const redirectLocation = getResponse.headers.get('location');
        
        if (redirectLocation) {
          const redirectResponse = await fetch(redirectLocation, { method: 'HEAD' });
          const actualLength = parseInt(redirectResponse.headers.get('content-length') || '0');
          if (actualLength > 0) {
            return { sizeMB: actualLength / (1024 * 1024), contentLength: actualLength };
          }
        }
      }

      return contentLength > 0 ? { 
        sizeMB: contentLength / (1024 * 1024), 
        contentLength 
      } : null;

    } catch (error) {
      console.error('Failed to get file metadata:', error);
      return null;
    }
  }

  /**
   * Initialize Facebook chunked upload session
   */
  private static async initializeFacebookUpload(
    pageToken: string, 
    pageId: string, 
    fileSize: number, 
    isReel: boolean = false
  ): Promise<{ videoId: string; sessionId: string } | null> {
    try {
      const endpoint = isReel 
        ? `https://graph.facebook.com/v23.0/${pageId}/video_reels`
        : `https://graph.facebook.com/v20.0/${pageId}/videos`;

      console.log(`🚀 Initializing Facebook ${isReel ? 'Reel' : 'Video'} upload session`);
      console.log(`📊 File size: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

      const params = new URLSearchParams({
        upload_phase: 'start',
        access_token: pageToken,
      });

      // Add file_size only for regular videos (not Reels per Facebook docs)
      if (!isReel) {
        params.append('file_size', fileSize.toString());
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      const data = await response.json() as { 
        video_id?: string; 
        upload_session_id?: string; 
        error?: any;
        start_offset?: number;
        end_offset?: number;
      };

      if (!response.ok || !data.video_id) {
        console.error('Facebook upload initialization failed:', data);
        return null;
      }

      console.log(`✅ Upload session initialized - Video ID: ${data.video_id}`);
      if (data.upload_session_id) {
        console.log(`📝 Upload Session ID: ${data.upload_session_id}`);
      }
      // For reels, Facebook uses upload_url instead of upload_session_id
      if (isReel && !data.upload_url) {
        console.error('Reel upload session missing upload_url:', data);
        return null;
      }
      
      return { 
        videoId: data.video_id, 
        sessionId: data.upload_session_id || data.video_id,
        uploadSessionId: data.upload_session_id, // Track upload session ID separately
        uploadUrl: data.upload_url // Track upload URL for reels
      };

    } catch (error) {
      console.error('Failed to initialize Facebook upload:', error);
      return null;
    }
  }

  /**
   * Upload a chunk to Facebook
   */
  private static async uploadChunkToFacebook(
    pageToken: string,
    pageId: string,
    sessionId: string,
    chunkData: Buffer,
    startOffset: number,
    isReel: boolean = false
  ): Promise<{ success: boolean; nextOffset?: number; error?: string }> {
    try {
      // Always use videos endpoint for chunk transfers (both reels and regular videos)
      const endpoint = `https://graph-video.facebook.com/v20.0/${pageId}/videos`;

      // Always use 'transfer' phase for chunk uploads
      const uploadPhase = 'transfer';
      
      const params = new URLSearchParams({
        upload_phase: uploadPhase,
        access_token: pageToken,
        upload_session_id: sessionId,
        start_offset: startOffset.toString()
      });

      console.log(`📤 Uploading chunk: ${chunkData.length} bytes at offset ${startOffset}`);

      const formData = new (await import('form-data')).default();
      formData.append('upload_phase', uploadPhase);
      formData.append('access_token', pageToken);
      formData.append('upload_session_id', sessionId);
      formData.append('start_offset', startOffset.toString());
      formData.append('video_file_chunk', chunkData, {
        filename: 'chunk.mp4',
        contentType: 'video/mp4'
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      const result = await response.json() as { 
        start_offset?: number; 
        end_offset?: number; 
        error?: any 
      };

      if (!response.ok) {
        console.error('Chunk upload failed:', result);
        return { success: false, error: JSON.stringify(result) };
      }

      const nextOffset = result.end_offset || (startOffset + chunkData.length);
      console.log(`✅ Chunk uploaded successfully, next offset: ${nextOffset}`);
      
      return { success: true, nextOffset };

    } catch (error) {
      console.error('Chunk upload error:', error);
      return { success: false, error: `Chunk upload failed: ${error}` };
    }
  }

  /**
   * Upload chunk directly to Facebook Reels upload URL
   */
  private static async uploadChunkToReelUrl(
    uploadUrl: string,
    pageToken: string,
    chunkData: Buffer,
    startOffset: number
  ): Promise<{ success: boolean; nextOffset?: number; error?: string }> {
    try {
      console.log(`📤 Uploading reel chunk: ${chunkData.length} bytes at offset ${startOffset}`);

      const formData = new (await import('form-data')).default();
      // Facebook rupload requires OAuth Authorization header and Offset as header, not form parameter
      formData.append('video_file_chunk', chunkData, {
        filename: 'chunk.mp4',
        contentType: 'video/mp4'
      });

      const headers = {
        ...formData.getHeaders(),
        'Authorization': `OAuth ${pageToken}`,
        'Offset': startOffset.toString()
      };

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: headers
      });

      const result = await response.json() as { 
        start_offset?: number; 
        end_offset?: number; 
        error?: any 
      };

      if (!response.ok) {
        console.error('Reel chunk upload failed:', result);
        return { success: false, error: JSON.stringify(result) };
      }

      const nextOffset = result.end_offset || (startOffset + chunkData.length);
      console.log(`✅ Reel chunk uploaded successfully, next offset: ${nextOffset}`);
      
      return { success: true, nextOffset };

    } catch (error) {
      console.error('Reel chunk upload error:', error);
      return { success: false, error: `Reel chunk upload failed: ${error}` };
    }
  }

  /**
   * Finalize Facebook upload
   */
  private static async finalizeFacebookUpload(
    pageToken: string,
    pageId: string,
    videoId: string,
    uploadSessionId: string | undefined,
    description: string = '',
    isReel: boolean = false
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      const endpoint = isReel 
        ? `https://graph.facebook.com/v23.0/${pageId}/video_reels`
        : `https://graph.facebook.com/v20.0/${pageId}/videos`;

      // Facebook Reels API uses video_id instead of upload_session_id for finalization
      const params = new URLSearchParams({
        upload_phase: 'finish',
        access_token: pageToken,
      });
      
      if (isReel) {
        params.append('video_id', videoId);
        console.log(`🎬 REEL FINALIZE: Using video_id=${videoId}`);
      } else {
        if (!uploadSessionId) {
          throw new Error('Upload session ID required for regular video finalization');
        }
        params.append('upload_session_id', uploadSessionId);
        console.log(`🎥 VIDEO FINALIZE: Using upload_session_id=${uploadSessionId}`);
      }

      if (description) {
        params.append('description', description);
      }

      console.log('🏁 Finalizing Facebook upload...');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      const result = await response.json() as { success?: boolean; id?: string; error?: any };

      if (!response.ok) {
        console.error('Upload finalization failed:', result);
        return { success: false, error: JSON.stringify(result) };
      }

      console.log('✅ Facebook upload finalized successfully');
      return { success: true, postId: result.id };

    } catch (error) {
      console.error('Upload finalization error:', error);
      return { success: false, error: `Finalization failed: ${error}` };
    }
  }

  /**
   * Stream video from Google Drive to Facebook in chunks without local storage
   */
  static async uploadGoogleDriveVideo(options: TrueStreamingOptions): Promise<TrueStreamingResult> {
    const uploadId = options.uploadId || `true_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🌊 STARTING TRUE CHUNKED STREAMING - ID: ${uploadId}`);
    
    try {
      // Check disk space using monitoring service
      const { DiskSpaceMonitor } = await import('./diskSpaceMonitor');
      const spaceAlert = await DiskSpaceMonitor.checkDiskSpace();
      
      if (spaceAlert && (spaceAlert.level === 'critical' || spaceAlert.level === 'emergency')) {
        throw new Error(`Disk space too low: ${spaceAlert.message}`);
      }

      // Get account details
      const account = await storage.getFacebookAccount(options.accountId);
      if (!account) {
        throw new Error('Facebook account not found');
      }

      // Extract file ID and get metadata
      const fileId = this.extractFileId(options.googleDriveUrl);
      if (!fileId) {
        throw new Error('Invalid Google Drive URL');
      }

      const directUrl = this.getGoogleDriveUrl(fileId);
      console.log(`📥 Getting file metadata for: ${fileId}`);
      
      progressTracker.updateProgress(uploadId, 'Getting file information...', 10, 'Retrieving file metadata from Google Drive');

      const metadata = await this.getFileMetadata(directUrl);
      if (!metadata) {
        throw new Error('Unable to determine file size - file may be too large or require authentication');
      }

      console.log(`📊 File size: ${metadata.sizeMB.toFixed(1)}MB (${metadata.contentLength} bytes)`);

      // Check if safe for operation
      const safetyCheck = await DiskSpaceMonitor.isSafeForLargeOperation(metadata.sizeMB);
      if (!safetyCheck.safe) {
        throw new Error(`Operation not safe: ${safetyCheck.reason}`);
      }

      progressTracker.updateProgress(uploadId, 'Initializing Facebook upload...', 20, 'Starting Facebook upload session');

      // Initialize Facebook upload
      const uploadSession = await this.initializeFacebookUpload(
        account.accessToken,
        account.pageId,
        metadata.contentLength,
        options.isReel
      );

      if (!uploadSession) {
        throw new Error('Failed to initialize Facebook upload session');
      }

      progressTracker.updateProgress(uploadId, 'Streaming chunks to Facebook...', 30, 'Beginning chunked upload');

      // Start streaming upload
      const fileResponse = await fetch(directUrl);
      if (!fileResponse.ok || !fileResponse.body) {
        throw new Error('Failed to start Google Drive file stream');
      }

      let uploadedBytes = 0;
      // Use Node.js stream iteration instead of Web Streams getReader()
      if (!fileResponse.body) {
        throw new Error('No response body available for streaming');
      }
      let buffer = Buffer.alloc(0);

      // Use Node.js async iteration instead of Web Streams
      for await (const chunk of fileResponse.body as any) {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);

        // Upload complete chunks
        while (buffer.length >= this.CHUNK_SIZE) {
          const chunkSize = this.CHUNK_SIZE;
          const uploadChunk = buffer.subarray(0, chunkSize);
          buffer = buffer.subarray(chunkSize);

          // Upload chunk to Facebook - use different method for reels
          let chunkResult;
          if (options.isReel && uploadSession.uploadUrl) {
            // Use direct upload URL for reels
            chunkResult = await this.uploadChunkToReelUrl(
              uploadSession.uploadUrl,
              account.accessToken,
              uploadChunk,
              uploadedBytes
            );
          } else {
            // Use session-based upload for regular videos
            const sessionIdForChunk = options.isReel && uploadSession.uploadSessionId ? 
              uploadSession.uploadSessionId : uploadSession.sessionId;
            
            chunkResult = await this.uploadChunkToFacebook(
              account.accessToken,
              account.pageId,
              sessionIdForChunk,
              uploadChunk,
              uploadedBytes,
              options.isReel
            );
          }

          if (!chunkResult.success) {
            throw new Error(chunkResult.error || 'Chunk upload failed');
          }

          uploadedBytes += uploadChunk.length;
          
          // Update progress
          const progress = 30 + Math.round((uploadedBytes / metadata.contentLength) * 60);
          progressTracker.updateProgress(
            uploadId, 
            `Uploaded ${(uploadedBytes / 1024 / 1024).toFixed(1)}MB of ${metadata.sizeMB.toFixed(1)}MB`, 
            progress, 
            'Streaming chunks to Facebook'
          );
        }
      }

      // Upload any remaining data in buffer
      if (buffer.length > 0) {
        // Upload final chunk - use different method for reels
        let chunkResult;
        if (options.isReel && uploadSession.uploadUrl) {
          // Use direct upload URL for reels
          chunkResult = await this.uploadChunkToReelUrl(
            uploadSession.uploadUrl,
            account.accessToken,
            buffer,
            uploadedBytes
          );
        } else {
          // Use session-based upload for regular videos
          const sessionIdForChunk = options.isReel && uploadSession.uploadSessionId ? 
            uploadSession.uploadSessionId : uploadSession.sessionId;
          
          chunkResult = await this.uploadChunkToFacebook(
            account.accessToken,
            account.pageId,
            sessionIdForChunk,
            buffer,
            uploadedBytes,
            options.isReel
          );
        }

        if (!chunkResult.success) {
          throw new Error(chunkResult.error || 'Final chunk upload failed');
        }

        uploadedBytes += buffer.length;
      }

      console.log(`📤 All chunks uploaded: ${uploadedBytes} bytes`);
      progressTracker.updateProgress(uploadId, 'Finalizing upload...', 95, 'Completing Facebook upload');

      // Finalize upload
      const finalResult = await this.finalizeFacebookUpload(
        account.accessToken,
        account.pageId,
        uploadSession.videoId,
        uploadSession.uploadSessionId,
        options.content || '',
        options.isReel
      );

      if (!finalResult.success) {
        throw new Error(finalResult.error || 'Upload finalization failed');
      }

      console.log('✅ TRUE CHUNKED STREAMING COMPLETED SUCCESSFULLY');
      progressTracker.updateProgress(uploadId, 'Upload complete!', 100, 'Video successfully uploaded to Facebook');

      return {
        success: true,
        facebookVideoId: uploadSession.videoId,
        facebookPostId: finalResult.postId || uploadSession.videoId,
        method: 'true_chunked_streaming',
        sizeMB: metadata.sizeMB
      };

    } catch (error) {
      console.error('❌ TRUE STREAMING UPLOAD FAILED:', error);
      progressTracker.updateProgress(uploadId, `Upload failed: ${error}`, 0, 'Upload process failed');
      
      return {
        success: false,
        error: `True streaming upload failed: ${error}`,
        method: 'true_chunked_streaming'
      };
    }
  }
}