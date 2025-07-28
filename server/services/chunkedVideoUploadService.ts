import fetch from 'node-fetch';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export interface ChunkedUploadOptions {
  accessToken: string;
  pageId: string;
  filePath: string;
  title?: string;
  description?: string;
  customLabels?: string[];
  language?: string;
}

export interface ChunkedUploadResult {
  success: boolean;
  videoId?: string;
  facebookUrl?: string;
  uploadSessionId?: string;
  error?: string;
  totalSize?: number;
  uploadedBytes?: number;
}

export class ChunkedVideoUploadService {
  
  async startUploadSession(options: ChunkedUploadOptions): Promise<{
    success: boolean;
    sessionId?: string;
    videoId?: string;
    startOffset?: number;
    endOffset?: number;
    error?: string;
  }> {
    
    const fileSize = fs.statSync(options.filePath).size;
    
    console.log(`Starting Facebook upload session for ${(fileSize / (1024 * 1024)).toFixed(1)}MB video`);
    
    const startUrl = `https://graph-video.facebook.com/v19.0/${options.pageId}/videos`;
    
    const params = new URLSearchParams({
      upload_phase: 'start',
      access_token: options.accessToken,
      file_size: fileSize.toString()
    });
    
    try {
      const response = await fetch(startUrl, {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Start phase failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Start phase error: ${result.error.message || result.error}`);
      }
      
      if (!result.upload_session_id) {
        throw new Error(`No session ID returned: ${JSON.stringify(result)}`);
      }
      
      console.log(`Upload session started: ${result.upload_session_id}`);
      console.log(`Video ID: ${result.video_id}`);
      console.log(`First chunk: ${result.start_offset} to ${result.end_offset}`);
      
      return {
        success: true,
        sessionId: result.upload_session_id,
        videoId: result.video_id,
        startOffset: parseInt(result.start_offset),
        endOffset: parseInt(result.end_offset)
      };
      
    } catch (error) {
      console.error('Start upload session error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  async transferChunk(options: {
    pageId: string;
    accessToken: string;
    sessionId: string;
    filePath: string;
    startOffset: number;
    endOffset: number;
  }): Promise<{
    success: boolean;
    nextStartOffset?: number;
    nextEndOffset?: number;
    isComplete?: boolean;
    error?: string;
  }> {
    
    const chunkSize = options.endOffset - options.startOffset;
    console.log(`Transferring chunk: ${options.startOffset} to ${options.endOffset} (${(chunkSize / (1024 * 1024)).toFixed(1)}MB)`);
    
    try {
      // Read the specific chunk from file
      const fileHandle = fs.openSync(options.filePath, 'r');
      const buffer = Buffer.alloc(chunkSize);
      fs.readSync(fileHandle, buffer, 0, chunkSize, options.startOffset);
      fs.closeSync(fileHandle);
      
      const transferUrl = `https://graph-video.facebook.com/v19.0/${options.pageId}/videos`;
      
      const formData = new FormData();
      formData.append('upload_phase', 'transfer');
      formData.append('upload_session_id', options.sessionId);
      formData.append('start_offset', options.startOffset.toString());
      formData.append('access_token', options.accessToken);
      formData.append('video_file_chunk', buffer, {
        filename: 'chunk.mp4',
        contentType: 'video/mp4'
      });
      
      const response = await fetch(transferUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transfer failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Transfer error: ${result.error.message || result.error}`);
      }
      
      const nextStart = parseInt(result.start_offset);
      const nextEnd = parseInt(result.end_offset);
      const isComplete = nextStart === nextEnd;
      
      console.log(`Chunk transferred. Next: ${nextStart} to ${nextEnd}${isComplete ? ' (Complete)' : ''}`);
      
      return {
        success: true,
        nextStartOffset: nextStart,
        nextEndOffset: nextEnd,
        isComplete: isComplete
      };
      
    } catch (error) {
      console.error('Transfer chunk error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  async finishUpload(options: {
    pageId: string;
    accessToken: string;
    sessionId: string;
    title?: string;
    description?: string;
    customLabels?: string[];
    language?: string;
  }): Promise<{
    success: boolean;
    videoId?: string;
    facebookUrl?: string;
    error?: string;
  }> {
    
    console.log('Finishing upload session');
    
    try {
      const finishUrl = `https://graph-video.facebook.com/v19.0/${options.pageId}/videos`;
      
      const params = new URLSearchParams({
        upload_phase: 'finish',
        upload_session_id: options.sessionId,
        access_token: options.accessToken
      });
      
      if (options.title) {
        params.append('title', options.title);
      }
      
      if (options.description) {
        params.append('description', options.description);
      }
      
      // Add custom labels for Meta Insights tracking
      if (options.customLabels && options.customLabels.length > 0) {
        const labelArray = options.customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25) // Facebook limit: 25 chars per label
          .slice(0, 10); // Facebook limit: max 10 labels per post
        
        if (labelArray.length > 0) {
          params.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to chunked video upload:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (options.language) {
        params.append('locale', options.language);
      }
      
      // Add privacy and publishing settings
      params.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      params.append('published', 'true');
      params.append('content_category', 'ENTERTAINMENT');
      params.append('embeddable', 'true');
      
      const response = await fetch(finishUrl, {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Finish phase failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (result.error) {
        throw new Error(`Finish phase error: ${result.error.message || result.error}`);
      }
      
      const videoId = result.id || result.video_id;
      const facebookUrl = videoId ? `https://www.facebook.com/video.php?v=${videoId}` : 'Processing...';
      
      console.log(`Upload completed successfully`);
      console.log(`Video ID: ${videoId}`);
      console.log(`Facebook URL: ${facebookUrl}`);
      console.log(`Full result: ${JSON.stringify(result)}`);
      
      return {
        success: true,
        videoId: videoId,
        facebookUrl: facebookUrl
      };
      
    } catch (error) {
      console.error('Finish upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  async uploadVideoInChunks(options: ChunkedUploadOptions): Promise<ChunkedUploadResult> {
    try {
      const fileSize = fs.statSync(options.filePath).size;
      const sizeMB = fileSize / (1024 * 1024);
      
      console.log(`Starting chunked upload for ${sizeMB.toFixed(1)}MB video`);
      
      // Phase 1: Start upload session
      const startResult = await this.startUploadSession(options);
      
      if (!startResult.success) {
        return {
          success: false,
          error: `Start phase failed: ${startResult.error}`,
          totalSize: fileSize
        };
      }
      
      let currentStartOffset = startResult.startOffset!;
      let currentEndOffset = startResult.endOffset!;
      let uploadedBytes = 0;
      
      // Phase 2: Transfer chunks
      while (true) {
        const transferResult = await this.transferChunk({
          pageId: options.pageId,
          accessToken: options.accessToken,
          sessionId: startResult.sessionId!,
          filePath: options.filePath,
          startOffset: currentStartOffset,
          endOffset: currentEndOffset
        });
        
        if (!transferResult.success) {
          return {
            success: false,
            error: `Transfer failed: ${transferResult.error}`,
            uploadSessionId: startResult.sessionId,
            totalSize: fileSize,
            uploadedBytes: uploadedBytes
          };
        }
        
        uploadedBytes = currentEndOffset;
        const progressPercent = (uploadedBytes / fileSize * 100).toFixed(1);
        console.log(`Upload progress: ${progressPercent}% (${(uploadedBytes / (1024 * 1024)).toFixed(1)}MB)`);
        
        if (transferResult.isComplete) {
          console.log('All chunks transferred successfully');
          break;
        }
        
        currentStartOffset = transferResult.nextStartOffset!;
        currentEndOffset = transferResult.nextEndOffset!;
      }
      
      // Phase 3: Finish upload
      const finishResult = await this.finishUpload({
        pageId: options.pageId,
        accessToken: options.accessToken,
        sessionId: startResult.sessionId!,
        title: options.title,
        description: options.description,
        customLabels: options.customLabels,
        language: options.language
      });
      
      if (!finishResult.success) {
        return {
          success: false,
          error: `Finish phase failed: ${finishResult.error}`,
          uploadSessionId: startResult.sessionId,
          totalSize: fileSize,
          uploadedBytes: uploadedBytes
        };
      }
      
      return {
        success: true,
        videoId: finishResult.videoId,
        facebookUrl: finishResult.facebookUrl,
        uploadSessionId: startResult.sessionId,
        totalSize: fileSize,
        uploadedBytes: fileSize
      };
      
    } catch (error) {
      console.error('Chunked upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        totalSize: fs.existsSync(options.filePath) ? fs.statSync(options.filePath).size : 0
      };
    } finally {
      // Cleanup temp file
      try {
        if (fs.existsSync(options.filePath)) {
          fs.unlinkSync(options.filePath);
          console.log('Temp file cleaned up');
        }
      } catch (cleanupError) {
        console.warn('Cleanup warning:', cleanupError);
      }
    }
  }
}