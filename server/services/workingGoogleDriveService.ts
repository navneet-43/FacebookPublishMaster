import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WorkingVideoResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  sizeMB?: number;
  isActualVideo?: boolean;
}

export class WorkingGoogleDriveService {
  static async processGoogleDriveVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<WorkingVideoResult> {
    console.log('Processing Google Drive video with working approach');
    
    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/working_gdrive_${Date.now()}.mp4`;
      
      console.log('Downloading Google Drive video');
      
      // Download using the working method
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `curl -L --max-time 120 --connect-timeout 30 -o "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand);
      
      if (!fs.existsSync(downloadFile)) {
        throw new Error('Download failed - file not accessible');
      }
      
      const downloadStats = fs.statSync(downloadFile);
      const downloadSizeMB = downloadStats.size / (1024 * 1024);
      
      console.log(`Downloaded: ${downloadSizeMB.toFixed(1)}MB`);
      
      if (downloadSizeMB < 5) {
        fs.unlinkSync(downloadFile);
        throw new Error('Downloaded file too small - may be access restricted');
      }
      
      // If file is large, optimize it for Facebook
      let finalVideoFile = downloadFile;
      let finalSizeMB = downloadSizeMB;
      
      if (downloadSizeMB > 100) {
        console.log('Optimizing large video for Facebook compatibility');
        
        const optimizedFile = `/tmp/optimized_gdrive_${Date.now()}.mp4`;
        
        // Optimize large videos to under 50MB while maintaining quality
        const optimizeCommand = `ffmpeg -i "${downloadFile}" -c:v libx264 -preset medium -crf 23 -b:v 2000k -maxrate 2500k -bufsize 5000k -c:a aac -b:a 128k -movflags +faststart "${optimizedFile}"`;
        
        await execAsync(optimizeCommand, { timeout: 300000 });
        
        if (fs.existsSync(optimizedFile)) {
          const optimizedStats = fs.statSync(optimizedFile);
          const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
          
          console.log(`Optimized to: ${optimizedSizeMB.toFixed(1)}MB`);
          
          // Use optimized file if significantly smaller
          if (optimizedSizeMB < downloadSizeMB * 0.5) {
            fs.unlinkSync(downloadFile);
            finalVideoFile = optimizedFile;
            finalSizeMB = optimizedSizeMB;
          } else {
            fs.unlinkSync(optimizedFile);
          }
        }
      }
      
      console.log(`Uploading ${finalSizeMB.toFixed(1)}MB video to Facebook`);
      
      // Upload to Facebook with proper video parameters
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(finalVideoFile);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Google Drive Video - ${finalSizeMB.toFixed(1)}MB`);
      formData.append('description', `Google Drive Video Upload - Working Method - ${finalSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Video uploaded successfully');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Video Upload - Working Method - ${finalSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(finalVideoFile);
          
          // Wait and verify it's an actual video
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          const isActualVideo = await this.verifyActualVideoUpload(pageId, accessToken, uploadResult.id);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            sizeMB: finalSizeMB,
            isActualVideo: isActualVideo
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Upload error:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(finalVideoFile);
      
      return {
        success: false,
        error: `Upload failed: ${uploadResponse.status} - ${errorText}`,
        sizeMB: finalSizeMB,
        isActualVideo: false
      };
      
    } catch (error) {
      console.log('Working method error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        isActualVideo: false
      };
    }
  }
  
  private static async verifyActualVideoUpload(
    pageId: string,
    accessToken: string,
    videoId: string
  ): Promise<boolean> {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Method 1: Check video object directly
      const videoUrl = `https://graph.facebook.com/v18.0/${videoId}?fields=id,status,format&access_token=${accessToken}`;
      const videoResponse = await fetch(videoUrl);
      
      if (videoResponse.ok) {
        const videoData = await videoResponse.json() as any;
        if (videoData.status && videoData.status.video_status === 'ready') {
          return true;
        }
      }
      
      // Method 2: Check if it appears in posts with video attachment
      const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,attachments&access_token=${accessToken}&limit=10`;
      const postsResponse = await fetch(postsUrl);
      
      if (postsResponse.ok) {
        const postsData = await postsResponse.json() as any;
        
        if (postsData.data) {
          const videoPost = postsData.data.find((post: any) => 
            post.message?.includes('Working Method') &&
            post.attachments &&
            post.attachments.data &&
            post.attachments.data[0].type === 'video_inline'
          );
          
          return !!videoPost;
        }
      }
      
      return false;
    } catch (error) {
      console.log('Verification error:', (error as Error).message);
      return false;
    }
  }
}