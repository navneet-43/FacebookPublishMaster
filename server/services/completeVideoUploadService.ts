import { FFmpegGoogleDriveService } from './ffmpegGoogleDriveService';
import { FacebookVideoUploadService } from './facebookVideoUploadService';
import { storage } from '../storage';
import * as fs from 'fs';

export class CompleteVideoUploadService {
  
  static async processGoogleDriveVideo(
    url: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    description: string,
    customLabels: string[] = []
  ): Promise<{ success: boolean; videoId?: string; sizeMB?: number; error?: string; step?: string }> {
    
    console.log('🎯 COMPLETE VIDEO UPLOAD PROCESS');
    console.log('📁 Google Drive URL:', url);
    console.log('📄 Facebook Page:', pageId);
    console.log('💬 Description:', description);
    
    let downloadedFile: string | undefined;
    
    try {
      // Step 1: Download video using FFmpeg
      console.log('⬇️ Step 1: Downloading video with FFmpeg...');
      
      const downloadResult = await FFmpegGoogleDriveService.downloadLargeVideo(url);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        console.log('❌ Download failed:', downloadResult.error);
        return { 
          success: false, 
          error: downloadResult.error || 'Download failed', 
          step: 'download' 
        };
      }
      
      downloadedFile = downloadResult.filePath;
      console.log('✅ Download completed:', downloadResult.sizeMB?.toFixed(1) + 'MB');
      
      // Step 2: Upload to Facebook as actual video
      console.log('⬆️ Step 2: Uploading to Facebook...');
      
      const uploadResult = await FacebookVideoUploadService.uploadVideoFile(
        downloadedFile,
        pageId,
        accessToken,
        description,
        customLabels
      );
      
      if (!uploadResult.success) {
        console.log('❌ Facebook upload failed:', uploadResult.error);
        return { 
          success: false, 
          error: uploadResult.error || 'Facebook upload failed', 
          step: 'facebook_upload' 
        };
      }
      
      console.log('✅ Facebook upload successful');
      console.log('🎬 Video ID:', uploadResult.videoId);
      
      // Step 3: Save to database
      console.log('💾 Step 3: Saving to database...');
      
      await storage.createPost({
        userId: 3, // Default user
        accountId: accountId,
        content: description,
        mediaUrl: url,
        mediaType: 'video',
        customLabels: customLabels,
        language: 'en',
        status: 'published',
        publishedAt: new Date()
      });
      
      console.log('✅ Saved to database');
      
      // Step 4: Clean up temporary file
      if (fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
        console.log('🧹 Temporary file cleaned up');
      }
      
      return {
        success: true,
        videoId: uploadResult.videoId,
        sizeMB: downloadResult.sizeMB
      };
      
    } catch (error) {
      console.log('❌ Process error:', (error as Error).message);
      
      // Clean up on error
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
        console.log('🧹 Cleaned up temporary file after error');
      }
      
      return { 
        success: false, 
        error: (error as Error).message, 
        step: 'unknown' 
      };
    }
  }
  
  static async testGoogleDriveUpload(
    url: string = 'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link'
  ): Promise<any> {
    
    console.log('🧪 TESTING GOOGLE DRIVE VIDEO UPLOAD');
    
    // Get Alright Tamil account
    const accounts = await storage.getFacebookAccounts(3);
    const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
    
    if (!tamilAccount) {
      console.log('❌ Alright Tamil account not found');
      return { error: 'Account not found' };
    }
    
    console.log('📄 Using account:', tamilAccount.name);
    
    const result = await this.processGoogleDriveVideo(
      url,
      tamilAccount.id,
      tamilAccount.pageId,
      tamilAccount.accessToken,
      'FFmpeg Google Drive Video Upload - Actual Video File (Not Link)',
      ['ffmpeg-download', 'google-drive', 'actual-video']
    );
    
    if (result.success) {
      console.log('🎉 TEST SUCCESSFUL');
      console.log('✅ Video downloaded with FFmpeg');
      console.log('✅ Video uploaded as actual Facebook video file');
      console.log('📊 File size:', result.sizeMB?.toFixed(1) + 'MB');
      console.log('🎬 Facebook Video ID:', result.videoId);
      console.log('🔗 Facebook Page: https://facebook.com/101307726083031');
      
      return {
        success: true,
        method: 'ffmpeg_download_facebook_upload',
        downloadSizeMB: result.sizeMB,
        facebookVideoId: result.videoId,
        type: 'actual_video_file'
      };
    } else {
      console.log('❌ TEST FAILED');
      console.log('Failed at step:', result.step);
      console.log('Error:', result.error);
      
      return {
        success: false,
        failedStep: result.step,
        error: result.error
      };
    }
  }
}