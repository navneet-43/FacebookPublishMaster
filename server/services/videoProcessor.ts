import fetch from 'node-fetch';
import { createWriteStream, createReadStream, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';

export interface VideoProcessingResult {
  success: boolean;
  processedUrl?: string;
  originalSize?: number;
  processedSize?: number;
  error?: string;
  skipProcessing?: boolean;
}

/**
 * Video processing service for Facebook-compatible uploads
 * Handles compression, format conversion, and size optimization
 */
export class VideoProcessor {
  
  // Facebook's video requirements
  static readonly MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
  static readonly RECOMMENDED_SIZE = 100 * 1024 * 1024; // 100MB for better upload success
  static readonly SUPPORTED_FORMATS = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'];
  static readonly MAX_DURATION = 240 * 60; // 240 minutes
  static readonly TEMP_DIR = join(process.cwd(), 'temp');

  /**
   * Check if video needs processing based on size and format
   */
  static async analyzeVideo(url: string): Promise<{
    needsProcessing: boolean;
    reason?: string;
    estimatedSize?: number;
    contentType?: string;
  }> {
    try {
      console.log('🔍 ANALYZING VIDEO:', url);
      
      // For Google Drive URLs, use comprehensive helper to find working access URL
      let analysisUrl = url;
      let finalResponse = null;
      let finalSize = 0;
      let finalContentType = null;
      
      if (url.includes('drive.google.com')) {
        const { GoogleDriveHelper } = await import('./googleDriveHelper');
        const result = await GoogleDriveHelper.findWorkingVideoUrl(url);
        
        if (result.workingUrl) {
          analysisUrl = result.workingUrl;
          finalSize = result.size;
          finalContentType = result.contentType;
          
          // Create a mock response object for compatibility
          finalResponse = {
            ok: true,
            headers: {
              get: (name: string) => {
                if (name === 'content-type') return result.contentType;
                if (name === 'content-length') return result.size.toString();
                return null;
              }
            }
          } as any;
          
          console.log('✅ Google Drive access successful');
        } else {
          // No working URL found, create detailed error
          const fileId = GoogleDriveHelper.extractFileId(url);
          const errorMessage = GoogleDriveHelper.generateErrorMessage(fileId || 'unknown', result.testedUrls);
          
          return {
            needsProcessing: true,
            reason: errorMessage,
            estimatedSize: 0,
            contentType: 'text/html'
          };
        }
      }
      
      // Handle Dropbox URLs
      if (url.includes('dropbox.com')) {
        const { DropboxHelper } = await import('./dropboxHelper');
        const result = await DropboxHelper.getOptimizedVideoUrl(url);
        
        analysisUrl = result.workingUrl;
        finalSize = result.size;
        finalContentType = result.contentType;
        
        // Create a mock response object for compatibility
        finalResponse = {
          ok: true,
          headers: {
            get: (name: string) => {
              if (name === 'content-type') return result.contentType;
              if (name === 'content-length') return result.size.toString();
              return null;
            }
          }
        } as any;
        
        console.log(`✅ Dropbox access configured: ${result.verified ? 'verified' : 'unverified'}`);
      }
      
      // If no Google Drive format worked, try original URL
      if (!finalResponse) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(analysisUrl, { 
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)',
            'Accept': 'video/*'
          }
        });
        
        clearTimeout(timeoutId);
        finalResponse = response;
        finalSize = response.headers.get('content-length') ? parseInt(response.headers.get('content-length') || '0', 10) : 0;
        finalContentType = response.headers.get('content-type');
      }

      if (!finalResponse.ok) {
        return {
          needsProcessing: true,
          reason: `Video URL not accessible: ${finalResponse.status}`
        };
      }

      const contentLength = finalResponse.headers.get('content-length');
      const contentType = finalContentType;
      const size = finalSize;
      
      console.log('📊 VIDEO ANALYSIS:', {
        size: `${(size / 1024 / 1024).toFixed(2)} MB`,
        type: contentType,
        accessible: finalResponse.ok
      });

      // Check if file exceeds Facebook's absolute limit
      if (size > this.MAX_VIDEO_SIZE) {
        return {
          needsProcessing: true,
          reason: `Video exceeds Facebook's 4GB limit: ${(size / 1024 / 1024 / 1024).toFixed(2)}GB`,
          estimatedSize: size,
          contentType: contentType || undefined
        };
      }

      // Special handling for Dropbox URLs - force video type if extension matches
      let actualContentType = contentType;
      if (url.includes('dropbox.com') && !contentType?.includes('video')) {
        const hasVideoExtension = url.match(/\.(mp4|mov|avi|mkv|wmv|flv|webm|m4v)(\?|$)/i);
        if (hasVideoExtension) {
          actualContentType = 'video/mp4'; // Force video content type
          console.log('🎬 FORCING VIDEO TYPE for Dropbox file based on extension');
        }
      }

      // Check if optimization is recommended (but not required)
      const needsOptimization = 
        size > this.RECOMMENDED_SIZE || 
        !actualContentType?.includes('video') ||
        (actualContentType && !this.isOptimalFormat(actualContentType));

      return {
        needsProcessing: false, // Allow upload but log warnings
        reason: needsOptimization ? `Large file warning: ${this.getProcessingReason(size, actualContentType || undefined)}` : undefined,
        estimatedSize: size,
        contentType: actualContentType || undefined
      };

    } catch (error) {
      console.error('❌ VIDEO ANALYSIS ERROR:', error);
      return {
        needsProcessing: true,
        reason: 'Unable to analyze video file'
      };
    }
  }

  /**
   * Determine if video format is optimal for Facebook
   */
  private static isOptimalFormat(contentType: string): boolean {
    return contentType.includes('mp4') || contentType.includes('video/mp4');
  }

  /**
   * Get reason why video needs processing
   */
  private static getProcessingReason(size: number, contentType?: string): string {
    const reasons = [];
    
    if (size > this.RECOMMENDED_SIZE) {
      reasons.push(`Large file size: ${(size / 1024 / 1024).toFixed(2)}MB`);
    }
    
    if (contentType && !this.isOptimalFormat(contentType)) {
      reasons.push(`Format optimization needed: ${contentType}`);
    }
    
    if (!contentType?.includes('video')) {
      reasons.push('Invalid or unknown video format');
    }

    return reasons.join(', ');
  }

  /**
   * Process video with multiple strategies
   */
  static async processVideo(url: string): Promise<VideoProcessingResult> {
    try {
      const analysis = await this.analyzeVideo(url);
      
      // Only block videos that exceed Facebook's 4GB absolute limit
      if (analysis.needsProcessing && analysis.reason?.includes('4GB limit')) {
        console.log('❌ VIDEO EXCEEDS 4GB LIMIT');
        const sizeMB = (analysis.estimatedSize || 0) / 1024 / 1024;
        const recommendations = this.getProcessingRecommendations(analysis);
        
        return {
          success: false,
          error: `Video exceeds Facebook's 4GB limit (${sizeMB.toFixed(1)}MB):\n\n${recommendations}`,
          originalSize: analysis.estimatedSize
        };
      }
      
      // Use the working URL found during analysis for Google Drive files
      let finalUrl = url;
      if (url.includes('drive.google.com')) {
        const { GoogleDriveHelper } = await import('./googleDriveHelper');
        const result = await GoogleDriveHelper.findWorkingVideoUrl(url);
        
        if (result.workingUrl) {
          finalUrl = result.workingUrl;
          console.log('🔄 USING VERIFIED GOOGLE DRIVE URL for Facebook upload');
        } else {
          console.log('⚠️ No working Google Drive URL found, using original');
        }
      }
      
      // For all other cases, allow upload with optional warnings
      if (analysis.reason && analysis.reason.includes('Large file warning')) {
        console.log('⚠️ LARGE VIDEO WARNING:', analysis.reason);
      } else {
        console.log('✅ VIDEO READY: Proceeding with upload');
      }
      
      return {
        success: true,
        processedUrl: finalUrl,
        skipProcessing: true,
        originalSize: analysis.estimatedSize
      };

      // Strategy 1: Try optimized URL parameters for Google Drive
      if (url.includes('drive.google.com')) {
        const optimizedUrl = this.optimizeGoogleDriveForVideo(url);
        if (optimizedUrl !== url) {
          console.log('🔄 TRYING OPTIMIZED GOOGLE DRIVE URL');
          const recheck = await this.analyzeVideo(optimizedUrl);
          if (!recheck.needsProcessing) {
            return {
              success: true,
              processedUrl: optimizedUrl,
              originalSize: analysis.estimatedSize,
              processedSize: recheck.estimatedSize
            };
          }
        }
      }

      // Strategy 2: Return processing recommendations instead of actual processing
      return {
        success: false,
        error: this.getProcessingRecommendations(analysis),
        originalSize: analysis.estimatedSize
      };

    } catch (error) {
      console.error('❌ VIDEO PROCESSING ERROR:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video processing failed'
      };
    }
  }

  /**
   * Extract file ID from Google Drive URL
   */
  private static extractGoogleDriveFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Optimize Google Drive URL for better video access
   */
  private static optimizeGoogleDriveForVideo(url: string): string {
    console.log('🔗 PROCESSING GOOGLE DRIVE URL:', url);
    
    // Extract file ID from various Google Drive URL formats
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const fileId = match[1];
        console.log('✅ EXTRACTED FILE ID:', fileId);
        
        // Try multiple Google Drive URL formats for maximum compatibility
        const formats = [
          `https://drive.google.com/uc?export=download&id=${fileId}`,
          `https://drive.google.com/u/0/uc?id=${fileId}&export=download`,
          `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
          `https://docs.google.com/uc?export=download&id=${fileId}`
        ];
        
        // Use the first format for now, but log all options
        const optimizedUrl = formats[0];
        console.log('🔄 TRYING PRIMARY URL:', optimizedUrl);
        console.log('📋 BACKUP OPTIONS:', formats.slice(1));
        
        return optimizedUrl;
      }
    }

    console.log('⚠️ Could not extract file ID, returning original URL');
    return url;
  }

  /**
   * Get comprehensive processing recommendations
   */
  private static getProcessingRecommendations(analysis: any): string {
    const size = analysis.estimatedSize || 0;
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    
    let recommendations = `Video requires optimization (${sizeMB}MB). Recommendations:\n\n`;
    
    if (size > this.RECOMMENDED_SIZE) {
      recommendations += `🎯 FILE SIZE: Reduce to under 100MB for optimal upload success\n`;
      recommendations += `• Use video compression tools (HandBrake, FFmpeg, or online compressors)\n`;
      recommendations += `• Reduce resolution: 1080p→720p or 720p→480p\n`;
      recommendations += `• Lower bitrate: Try 2-5 Mbps for good quality\n`;
      recommendations += `• Trim video length if possible\n\n`;
    }

    if (analysis.contentType && !this.isOptimalFormat(analysis.contentType)) {
      recommendations += `🎯 FORMAT: Convert to MP4 for best Facebook compatibility\n`;
      recommendations += `• Use H.264 video codec\n`;
      recommendations += `• Use AAC audio codec\n\n`;
    }

    recommendations += `🔧 QUICK SOLUTIONS:\n`;
    recommendations += `• Upload to YouTube first, then share YouTube link\n`;
    recommendations += `• Use video hosting services (Vimeo, Wistia)\n`;
    recommendations += `• Split into shorter video segments\n`;
    recommendations += `• Use cloud storage with direct video streaming\n\n`;

    recommendations += `💡 TOOLS: HandBrake (free), Adobe Media Encoder, CloudConvert.com`;

    return recommendations;
  }

  /**
   * Validate processed video meets Facebook requirements
   */
  static validateForFacebook(url: string, size?: number): {
    isValid: boolean;
    issues: string[];
  } {
    const issues = [];

    if (size && size > this.MAX_VIDEO_SIZE) {
      issues.push(`File too large: ${(size / 1024 / 1024 / 1024).toFixed(2)}GB (max: 4GB)`);
    }

    if (size && size > this.RECOMMENDED_SIZE) {
      issues.push(`File larger than recommended: ${(size / 1024 / 1024).toFixed(2)}MB (recommended: <100MB)`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}