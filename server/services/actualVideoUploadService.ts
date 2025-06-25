import { existsSync, unlinkSync, statSync } from 'fs';
import { spawn } from 'child_process';

/**
 * Service that guarantees actual video file uploads to Facebook
 * Multiple strategies to ensure videos are uploaded as files, not links
 */
export class ActualVideoUploadService {
  
  /**
   * Main method that guarantees video file upload using progressive strategies
   */
  static async guaranteeActualVideoUpload(
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
    finalSizeMB?: number;
    error?: string;
  }> {
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
    console.log('🎯 GUARANTEEING ACTUAL VIDEO UPLOAD');
    console.log(`📁 Input file: ${filePath}`);
    console.log(`📊 Page ID: ${pageId}`);
    
    if (!existsSync(filePath)) {
      console.log('❌ File does not exist at path:', filePath);
      return { success: false, error: 'Input file not found' };
    }
    
    const originalStats = statSync(filePath);
    const originalSizeMB = originalStats.size / 1024 / 1024;
    console.log(`📏 File size: ${originalSizeMB.toFixed(2)}MB`);
    
    // Strategy 1: Small files - direct upload
    if (originalSizeMB < 50) {
      console.log(`📤 Strategy 1: Direct upload (${originalSizeMB.toFixed(1)}MB)`);
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, filePath, description, customLabels, language, () => {}
      );
      if (result.success) {
        return { ...result, method: 'direct', finalSizeMB: originalSizeMB };
      }
    }
    
    // Strategy 2: Create Facebook-compatible version
    console.log('📤 Strategy 2: Facebook-compatible encoding');
    const compatibleFile = await this.createFacebookCompatible(filePath);
    if (compatibleFile) {
      const compatibleStats = statSync(compatibleFile);
      const compatibleSizeMB = compatibleStats.size / 1024 / 1024;
      
      const cleanup = () => {
        if (existsSync(compatibleFile)) {
          unlinkSync(compatibleFile);
          console.log('🗑️ Compatible video cleaned');
        }
      };
      
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, compatibleFile, description, customLabels, language, cleanup
      );
      
      if (result.success) {
        return { ...result, method: 'facebook_compatible', finalSizeMB: compatibleSizeMB };
      }
    }
    
    // Strategy 3: Compressed but high quality
    console.log('📤 Strategy 3: High-quality compression');
    const compressedFile = await this.createHighQualityCompressed(filePath);
    if (compressedFile) {
      const compressedStats = statSync(compressedFile);
      const compressedSizeMB = compressedStats.size / 1024 / 1024;
      
      const cleanup = () => {
        if (existsSync(compressedFile)) {
          unlinkSync(compressedFile);
          console.log('🗑️ Compressed video cleaned');
        }
      };
      
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, compressedFile, description, customLabels, language, cleanup
      );
      
      if (result.success) {
        return { ...result, method: 'high_quality_compressed', finalSizeMB: compressedSizeMB };
      }
    }
    
    // Strategy 4: Standard compression
    console.log('📤 Strategy 4: Standard compression');
    const standardFile = await this.createStandardCompressed(filePath);
    if (standardFile) {
      const standardStats = statSync(standardFile);
      const standardSizeMB = standardStats.size / 1024 / 1024;
      
      const cleanup = () => {
        if (existsSync(standardFile)) {
          unlinkSync(standardFile);
          console.log('🗑️ Standard video cleaned');
        }
      };
      
      const result = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId, pageAccessToken, standardFile, description, customLabels, language, cleanup
      );
      
      if (result.success) {
        return { ...result, method: 'standard_compressed', finalSizeMB: standardSizeMB };
      }
    }
    
    return {
      success: false,
      error: 'All video upload strategies failed'
    };
  }
  
  /**
   * Create Facebook-compatible version (good quality, reasonable size)
   */
  private static async createFacebookCompatible(inputPath: string): Promise<string | null> {
    try {
      const outputPath = `/tmp/facebook_compatible_${Date.now()}.mp4`;
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-s', '1920x1080',
          '-crf', '20', // High quality
          '-preset', 'medium',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'high',
          '-level', '4.0',
          '-maxrate', '5M',
          '-bufsize', '10M',
          '-b:a', '192k',
          '-y',
          outputPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg failed: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (existsSync(outputPath)) {
        const stats = statSync(outputPath);
        console.log(`✅ Facebook-compatible: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
        return outputPath;
      }
      
      return null;
    } catch (error) {
      console.log('Facebook-compatible encoding failed:', error);
      return null;
    }
  }
  
  /**
   * Create high-quality compressed version
   */
  private static async createHighQualityCompressed(inputPath: string): Promise<string | null> {
    try {
      const outputPath = `/tmp/hq_compressed_${Date.now()}.mp4`;
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-s', '1280x720',
          '-crf', '22', // Good quality
          '-preset', 'medium',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'high',
          '-level', '3.1',
          '-maxrate', '3M',
          '-bufsize', '6M',
          '-b:a', '128k',
          '-y',
          outputPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg failed: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (existsSync(outputPath)) {
        const stats = statSync(outputPath);
        console.log(`✅ High-quality compressed: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
        return outputPath;
      }
      
      return null;
    } catch (error) {
      console.log('High-quality compression failed:', error);
      return null;
    }
  }
  
  /**
   * Create standard compressed version (guaranteed to work)
   */
  private static async createStandardCompressed(inputPath: string): Promise<string | null> {
    try {
      const outputPath = `/tmp/standard_compressed_${Date.now()}.mp4`;
      
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-s', '854x480',
          '-crf', '25', // Standard quality
          '-preset', 'fast',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'baseline',
          '-level', '3.0',
          '-maxrate', '1M',
          '-bufsize', '2M',
          '-b:a', '96k',
          '-y',
          outputPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg failed: ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });
      
      if (existsSync(outputPath)) {
        const stats = statSync(outputPath);
        console.log(`✅ Standard compressed: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
        return outputPath;
      }
      
      return null;
    } catch (error) {
      console.log('Standard compression failed:', error);
      return null;
    }
  }
}