import * as fs from 'fs';
import { storage } from '../storage';

interface ChunkedUploadResult {
  success: boolean;
  videoId?: string;
  error?: any;
  uploadSessionId?: string;
  postId?: number;
}

export class ChunkedFacebookUploadService {
  private static readonly CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
  private static readonly MAX_RETRIES = 3;

  static async uploadLargeVideo(
    videoPath: string,
    accountId: number,
    description: string,
    mediaUrl: string
  ): Promise<ChunkedUploadResult> {
    const fetch = (await import('node-fetch')).default;
    const FormData = (await import('form-data')).default;
    
    try {
      console.log('Starting chunked upload for large video');

      const account = await storage.getFacebookAccount(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      const stats = fs.statSync(videoPath);
      const fileSize = stats.size;
      const fileSizeMB = fileSize / (1024 * 1024);
      
      console.log(`Video size: ${fileSizeMB.toFixed(1)}MB`);

      // Step 1: Initialize resumable upload session
      const uploadSession = await this.initializeUploadSession(
        account.pageId,
        account.accessToken,
        fileSize
      );

      if (!uploadSession.success) {
        throw new Error(`Upload session failed: ${uploadSession.error}`);
      }

      console.log('Upload session created:', uploadSession.uploadSessionId);

      // Step 2: Upload file in chunks
      const uploadResult = await this.uploadFileInChunks(
        videoPath,
        uploadSession.uploadSessionId!,
        account.pageId,
        account.accessToken,
        fileSize
      );

      if (!uploadResult.success) {
        throw new Error(`Chunked upload failed: ${uploadResult.error}`);
      }

      console.log('Chunked upload completed:', uploadResult.videoId);

      // Step 3: Save to database
      const newPost = await storage.createPost({
        userId: 3,
        accountId: account.id,
        content: description,
        mediaUrl: mediaUrl,
        mediaType: 'video',
        language: 'en',
        status: 'published',
        publishedAt: new Date()
      });

      console.log('Upload completed successfully');
      console.log('Database Post ID:', newPost.id);
      console.log('Facebook Video ID:', uploadResult.videoId);
      console.log('Size:', fileSizeMB.toFixed(1) + 'MB');

      return {
        success: true,
        videoId: uploadResult.videoId,
        postId: newPost.id
      };

    } catch (error) {
      console.error('Chunked upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private static async initializeUploadSession(
    pageId: string,
    accessToken: string,
    fileSize: number
  ): Promise<{ success: boolean; uploadSessionId?: string; error?: any }> {
    const fetch = (await import('node-fetch')).default;
    const FormData = (await import('form-data')).default;
    
    try {
      const url = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('upload_phase', 'start');
      formData.append('file_size', fileSize.toString());

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      const result = await response.json() as any;

      if (result.upload_session_id) {
        return {
          success: true,
          uploadSessionId: result.upload_session_id
        };
      } else {
        return {
          success: false,
          error: result
        };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private static async uploadFileInChunks(
    videoPath: string,
    uploadSessionId: string,
    pageId: string,
    accessToken: string,
    fileSize: number
  ): Promise<{ success: boolean; videoId?: string; error?: any }> {
    try {
      const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
      console.log(`Uploading ${totalChunks} chunks`);

      // Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startByte = chunkIndex * this.CHUNK_SIZE;
        const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, fileSize - 1);
        
        console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks} (${startByte}-${endByte})`);

        const success = await this.uploadChunk(
          videoPath,
          uploadSessionId,
          pageId,
          accessToken,
          startByte,
          endByte,
          fileSize
        );

        if (!success) {
          throw new Error(`Chunk ${chunkIndex + 1} upload failed`);
        }
      }

      // Finalize upload
      return await this.finalizeUpload(uploadSessionId, pageId, accessToken);

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private static async uploadChunk(
    videoPath: string,
    uploadSessionId: string,
    pageId: string,
    accessToken: string,
    startByte: number,
    endByte: number,
    fileSize: number
  ): Promise<boolean> {
    const fetch = (await import('node-fetch')).default;
    const FormData = (await import('form-data')).default;
    
    try {
      const chunkSize = endByte - startByte + 1;
      const buffer = Buffer.alloc(chunkSize);
      
      const fd = fs.openSync(videoPath, 'r');
      fs.readSync(fd, buffer, 0, chunkSize, startByte);
      fs.closeSync(fd);

      const url = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('upload_phase', 'transfer');
      formData.append('upload_session_id', uploadSessionId);
      formData.append('start_offset', startByte.toString());
      formData.append('video_file_chunk', buffer, {
        filename: 'chunk',
        contentType: 'application/octet-stream'
      });

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          ...formData.getHeaders(),
          'Content-Range': `bytes ${startByte}-${endByte}/${fileSize}`
        }
      });

      const result = await response.json() as any;
      
      if (response.status === 200 || result.success) {
        return true;
      } else {
        console.error('Chunk upload failed:', result);
        return false;
      }

    } catch (error) {
      console.error('Chunk upload error:', error);
      return false;
    }
  }

  private static async finalizeUpload(
    uploadSessionId: string,
    pageId: string,
    accessToken: string
  ): Promise<{ success: boolean; videoId?: string; error?: any }> {
    const fetch = (await import('node-fetch')).default;
    const FormData = (await import('form-data')).default;
    
    try {
      const url = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('upload_phase', 'finish');
      formData.append('upload_session_id', uploadSessionId);
      formData.append('description', 'Google Drive Video - Chunked Upload');
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      const result = await response.json() as any;

      if (result.id) {
        return {
          success: true,
          videoId: result.id
        };
      } else {
        return {
          success: false,
          error: result
        };
      }

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}