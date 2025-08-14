import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { storage } from '../storage';
import { insertPostSchema, insertActivitySchema } from '@shared/schema';
import { z } from 'zod';
import { YouTubeHelper } from './youtubeHelper';
import { VideoProcessor } from './videoProcessor';
import { UniversalMediaDownloadService } from './universalMediaDownloadService';

export interface ExcelPostData {
  content: string;
  scheduledFor: string;
  accountName?: string;
  customLabels?: string;
  language?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  data?: any[];
}

export interface AnalysisResult {
  success: boolean;
  data?: any[];
  error?: string;
  details?: string;
  googleDriveVideos?: number;
  sharepointVideos?: number;
  facebookVideos?: number;
  regularVideos?: number;
  estimatedSizes?: string[];
}

export class ExcelImportService {
  private static validatePostData(row: any, rowIndex: number): { isValid: boolean; errors: string[]; data?: ExcelPostData } {
    const errors: string[] = [];
    
    console.log(`Validating row ${rowIndex + 1}:`, row);
    
    // Handle different possible field names (Excel headers can vary)
    const content = row.content || row.Content || row.CONTENT || '';
    const scheduledFor = row.scheduledFor || row.scheduledfor || row['Scheduled Date'] || row.scheduled_for || '';
    const accountName = row.accountName || row.accountname || row['Account Name'] || row.account_name || '';
    const customLabels = row.customLabels || row.customlabels || row['Custom Labels'] || row.custom_labels || '';
    const language = row.language || row.Language || row.LANGUAGE || 'EN';
    const mediaUrl = row.mediaUrl || row.mediaurl || row['Media URL'] || row.media_url || '';
    const mediaType = row.mediaType || row.mediatype || row['Media Type'] || row.media_type || '';
    
    console.log(`Extracted fields for row ${rowIndex + 1}:`, {
      content, scheduledFor, accountName, customLabels, language, mediaUrl, mediaType
    });
    
    // Log mediaType specifically for debugging
    if (mediaType) {
      console.log(`📝 Row ${rowIndex + 1}: User specified mediaType: "${mediaType}" (will be preserved)`);
    }
    
    // Required fields validation
    if (!content || typeof content !== 'string' || content.trim() === '') {
      errors.push(`Row ${rowIndex + 1}: Content is required`);
    }
    
    if (!scheduledFor || scheduledFor.toString().trim() === '') {
      errors.push(`Row ${rowIndex + 1}: Scheduled date is required`);
    } else {
      // Validate date format - be more flexible with date parsing
      let date: Date;
      if (typeof scheduledFor === 'number') {
        // Excel serial date number
        date = new Date((scheduledFor - 25569) * 86400 * 1000);
      } else {
        const dateStr = scheduledFor.toString().trim();
        
        // Handle different date/time formats
        if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
          // Format: "2:30 PM" - time only, use today's date
          const today = new Date();
          const timeStr = dateStr.toUpperCase();
          let [time, period] = timeStr.split(/\s+/);
          let [hours, minutes] = time.split(':').map(Number);
          
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          
          date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?$/)) {
          // Format: "2024-07-24 14:30" or "2024-07-24 14:30:00"
          const [datePart, timePart] = dateStr.split(' ');
          const [year, month, day] = datePart.split('-').map(Number);
          const timeParts = timePart.split(':').map(Number);
          const [hours, minutes, seconds = 0] = timeParts;
          date = new Date(year, month - 1, day, hours, minutes, seconds);
        } else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i)) {
          // Format: "7/24/2024 2:30 PM", "07/24/2024 14:30", or "28/07/2025  15:05:00 PM"
          const parts = dateStr.split(/\s+/).filter((p: string) => p.length > 0); // Remove extra spaces
          const [datePart, timePart, period] = parts;
          const dateParts = datePart.split('/').map(Number);
          const timeParts = timePart.split(':').map(Number);
          let [hours, minutes, seconds = 0] = timeParts;
          
          // Fix invalid 24-hour format with AM/PM (like "15:05:00 PM")
          if (period && hours > 12) {
            // If hour is >12 and has AM/PM, treat as 24-hour format and ignore AM/PM
            console.log(`Row ${rowIndex + 1}: Invalid format "${timePart} ${period}" - treating as 24-hour format`);
          } else {
            // Apply AM/PM logic only for valid 12-hour format
            if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
          }
          
          // Determine if it's DD/MM/YYYY or MM/DD/YYYY format
          let month, day, year;
          if (dateParts[0] > 12) {
            // First number > 12, must be DD/MM/YYYY
            [day, month, year] = dateParts;
          } else if (dateParts[1] > 12) {
            // Second number > 12, must be MM/DD/YYYY
            [month, day, year] = dateParts;
          } else {
            // Ambiguous case, default to DD/MM/YYYY for international format
            [day, month, year] = dateParts;
          }
          
          date = new Date(year, month - 1, day, hours, minutes, seconds);
        } else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i)) {
          // Format: "7-24-2024 2:30 PM" or "07-24-2024 14:30"
          const parts = dateStr.split(/\s+/);
          const [datePart, timePart, period] = parts;
          const [month, day, year] = datePart.split('-').map(Number);
          const timeParts = timePart.split(':').map(Number);
          let [hours, minutes, seconds = 0] = timeParts;
          
          if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
          
          date = new Date(year, month - 1, day, hours, minutes, seconds);
        } else {
          // Try standard Date parsing as fallback
          date = new Date(dateStr);
        }
      }
      
      if (isNaN(date.getTime())) {
        const displayValue = typeof scheduledFor === 'string' ? scheduledFor : String(scheduledFor);
        errors.push(`Row ${rowIndex + 1}: Invalid date format for scheduledFor. Supported formats:
        • YYYY-MM-DD HH:MM:SS (e.g., "2024-07-24 14:30:00")
        • YYYY-MM-DD HH:MM (e.g., "2024-07-24 14:30")
        • MM/DD/YYYY HH:MM AM/PM (e.g., "7/24/2024 2:30 PM")
        • DD/MM/YYYY HH:MM AM/PM (e.g., "28/07/2025 15:05:00")
        • MM-DD-YYYY HH:MM AM/PM (e.g., "7-24-2024 2:30 PM")
        • HH:MM AM/PM (time only, uses today's date, e.g., "2:30 PM")
        Your value: "${displayValue}"`);
      }
    }
    
    if (errors.length > 0) {
      return { isValid: false, errors };
    }
    
    // Parse the date correctly with proper timezone handling
    let parsedDate: Date;
    if (typeof scheduledFor === 'number') {
      // Excel serial date number
      parsedDate = new Date((scheduledFor - 25569) * 86400 * 1000);
    } else {
      // Handle various date/time formats including "2:30 PM" format
      const dateStr = scheduledFor.toString().trim();
      
      // Use the same parsing logic as validation above
      if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
        // Format: "2:30 PM" - time only, use today's date
        const today = new Date();
        const timeStr = dateStr.toUpperCase();
        let [time, period] = timeStr.split(/\s+/);
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        parsedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
      } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?$/)) {
        // Format: "2024-07-24 14:30" or "2024-07-24 14:30:00"
        const [datePart, timePart] = dateStr.split(' ');
        const [year, month, day] = datePart.split('-').map(Number);
        const timeParts = timePart.split(':').map(Number);
        const [hours, minutes, seconds = 0] = timeParts;
        parsedDate = new Date(year, month - 1, day, hours, minutes, seconds);
      } else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i)) {
        // Format: "7/24/2024 2:30 PM", "07/24/2024 14:30", or "28/07/2025  15:05:00 PM"
        const parts = dateStr.split(/\s+/).filter((p: string) => p.length > 0); // Remove extra spaces
        const [datePart, timePart, period] = parts;
        const dateParts = datePart.split('/').map(Number);
        const timeParts = timePart.split(':').map(Number);
        let [hours, minutes, seconds = 0] = timeParts;
        
        // Fix invalid 24-hour format with AM/PM (like "15:05:00 PM")
        if (period && hours > 12) {
          // If hour is >12 and has AM/PM, treat as 24-hour format and ignore AM/PM
          console.log(`Row ${rowIndex + 1}: Invalid format "${timePart} ${period}" - treating as 24-hour format`);
        } else {
          // Apply AM/PM logic only for valid 12-hour format
          if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        // Determine if it's DD/MM/YYYY or MM/DD/YYYY format
        let month, day, year;
        if (dateParts[0] > 12) {
          // First number > 12, must be DD/MM/YYYY
          [day, month, year] = dateParts;
          console.log(`Row ${rowIndex + 1}: Detected DD/MM/YYYY format: ${day}/${month}/${year}`);
        } else if (dateParts[1] > 12) {
          // Second number > 12, must be MM/DD/YYYY
          [month, day, year] = dateParts;
          console.log(`Row ${rowIndex + 1}: Detected MM/DD/YYYY format: ${month}/${day}/${year}`);
        } else {
          // Ambiguous case, default to DD/MM/YYYY for international format
          [day, month, year] = dateParts;
          console.log(`Row ${rowIndex + 1}: Ambiguous date, using DD/MM/YYYY format: ${day}/${month}/${year}`);
        }
        
        parsedDate = new Date(year, month - 1, day, hours, minutes, seconds);
      } else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i)) {
        // Format: "7-24-2024 2:30 PM" or "07-24-2024 14:30"
        const parts = dateStr.split(/\s+/);
        const [datePart, timePart, period] = parts;
        const [month, day, year] = datePart.split('-').map(Number);
        const timeParts = timePart.split(':').map(Number);
        let [hours, minutes, seconds = 0] = timeParts;
        
        if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
        
        parsedDate = new Date(year, month - 1, day, hours, minutes, seconds);
      } else {
        // Try standard Date parsing as fallback
        parsedDate = new Date(dateStr);
      }
    }
    
    // Process Google Drive links to convert to direct download format
    let processedMediaUrl = mediaUrl ? mediaUrl.toString().trim() : undefined;
    if (processedMediaUrl && processedMediaUrl.includes('drive.google.com')) {
      console.log(`Converting Google Drive link: ${processedMediaUrl}`);
      processedMediaUrl = ExcelImportService.convertGoogleDriveLink(processedMediaUrl);
      console.log(`Converted to: ${processedMediaUrl}`);
    }

    console.log(`Row ${rowIndex + 1} - Original scheduledFor: ${scheduledFor}`);
    console.log(`Row ${rowIndex + 1} - Parsed date: ${parsedDate.toISOString()}`);
    console.log(`Row ${rowIndex + 1} - Local time: ${parsedDate.toLocaleString()}`);
    console.log(`Row ${rowIndex + 1} - Timezone offset: ${parsedDate.getTimezoneOffset()} minutes`);

    // Keep original input format for IST processing later
    console.log(`Row ${rowIndex + 1} - Scheduling for: ${scheduledFor}`);

    const data: ExcelPostData = {
      content: content.trim(),
      scheduledFor: scheduledFor.toString(),
      accountName: accountName.toString().trim(),
      customLabels: customLabels.toString().trim(),
      language: language.toString().trim() || 'EN',
      mediaUrl: processedMediaUrl,
      mediaType: mediaType.toString().trim() || undefined
    };
    
    return { isValid: true, errors: [], data };
  }

  // Analysis method for CSV preview functionality
  static async analyzeExcelFile(params: { fileBuffer: Buffer; filename: string }): Promise<AnalysisResult> {
    try {
      console.log('🔍 analyzeExcelFile method called');
      
      if (!params) {
        console.error('No parameters provided to analyzeExcelFile');
        return {
          success: false,
          error: 'No parameters provided',
          details: 'The analyzeExcelFile method requires fileBuffer and filename parameters'
        };
      }
      
      const { fileBuffer, filename } = params;
      
      if (!fileBuffer) {
        console.error('No fileBuffer provided');
        return {
          success: false,
          error: 'No file buffer provided',
          details: 'File buffer is required for analysis'
        };
      }
      
      if (!filename) {
        console.error('No filename provided');
        return {
          success: false,
          error: 'No filename provided',
          details: 'Filename is required for analysis'
        };
      }
      
      const isCSV = filename.toLowerCase().endsWith('.csv');
      console.log(`📁 Analyzing file: ${filename} (${isCSV ? 'CSV' : 'Excel'}), size: ${fileBuffer.length} bytes`);
      
      let posts: any[] = [];
      
      if (isCSV) {
        // Parse CSV file
        const csvText = fileBuffer.toString('utf-8');
        const parseResult = await new Promise<any>((resolve) => {
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.toLowerCase().replace(/\s+/g, ''),
            complete: (results) => resolve(results),
            error: (error: any) => resolve({ errors: [error] })
          });
        });
        
        if (parseResult.errors && parseResult.errors.length > 0) {
          return {
            success: false,
            error: 'CSV parsing failed',
            details: parseResult.errors.map((err: any) => err.message).join(', ')
          };
        }
        
        posts = parseResult.data || [];
      } else {
        // Parse Excel file
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        
        if (!sheetName) {
          return {
            success: false,
            error: 'No worksheets found in the Excel file'
          };
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          return {
            success: false,
            error: 'File must contain headers and at least one data row'
          };
        }
        
        // Extract headers and convert to objects
        const headers = jsonData[0] as string[];
        const dataRows = jsonData.slice(1);
        
        posts = dataRows
          .filter((row: unknown): row is any[] => Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== ''))
          .map((row: any[]) => {
            const obj: any = {};
            headers.forEach((header, index) => {
              if (header && typeof header === 'string') {
                obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
              }
            });
            return obj;
          });
      }
      
      // Analyze posts for various media platforms and statistics
      let googleDriveVideos = 0;
      let sharepointVideos = 0;
      let facebookVideos = 0;
      let regularVideos = 0;
      const estimatedSizes: string[] = [];
      
      posts.forEach((post: any, index: number) => {
        const mediaUrl = post.mediaurl || post.mediaUrl || post['media url'] || post['Media URL'] || '';
        
        if (mediaUrl && typeof mediaUrl === 'string') {
          if (UniversalMediaDownloadService.isSupportedUrl(mediaUrl)) {
            const platform = this.detectPlatform(mediaUrl);
            switch (platform) {
              case 'google_drive':
                googleDriveVideos++;
                estimatedSizes.push(`Row ${index + 1}: Google Drive media (size unknown)`);
                break;
              case 'sharepoint':
                sharepointVideos++;
                estimatedSizes.push(`Row ${index + 1}: SharePoint media (size unknown)`);
                break;
              case 'facebook':
                facebookVideos++;
                estimatedSizes.push(`Row ${index + 1}: Facebook video (size unknown)`);
                break;
            }
          } else if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || 
                     mediaUrl.includes('vimeo.com') || mediaUrl.includes('dropbox.com')) {
            regularVideos++;
            estimatedSizes.push(`Row ${index + 1}: External video`);
          }
        }
      });
      
      console.log(`✅ Analysis complete: ${posts.length} posts, ${googleDriveVideos} Google Drive, ${sharepointVideos} SharePoint, ${facebookVideos} Facebook videos, ${regularVideos} other videos`);
      
      return {
        success: true,
        data: posts,
        googleDriveVideos,
        regularVideos,
        estimatedSizes,
        sharepointVideos,
        facebookVideos
      };
      
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        success: false,
        error: 'File analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  static async parseExcelFile(fileBuffer: Buffer, userId: number, accountId?: number): Promise<ImportResult> {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      
      if (!sheetName) {
        return {
          success: false,
          imported: 0,
          failed: 0,
          errors: ['No worksheets found in the Excel file']
        };
      }
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length < 2) {
        return {
          success: false,
          imported: 0,
          failed: 0,
          errors: ['Excel file must contain headers and at least one data row']
        };
      }
      
      // Extract headers and convert to objects
      const headers = jsonData[0] as string[];
      const dataRows = jsonData.slice(1);
      
      console.log('Excel parsing - Headers:', headers);
      console.log('Excel parsing - DataRows type:', typeof dataRows, 'isArray:', Array.isArray(dataRows));
      console.log('Excel parsing - DataRows length:', dataRows?.length);
      
      if (!Array.isArray(dataRows)) {
        return {
          success: false,
          imported: 0,
          failed: 0,
          errors: ['Invalid Excel data format - expected array of rows']
        };
      }
      
      const posts = dataRows
        .filter((row: unknown): row is any[] => Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== ''))
        .map((row: any[], rowIndex: number) => {
          const obj: any = {};
          headers.forEach((header, index) => {
            if (header && typeof header === 'string') {
              obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
            }
          });
          console.log(`Row ${rowIndex + 1} parsed:`, obj);
          return obj;
        });
      
      return await this.processPostsData(posts, userId, accountId);
    } catch (error) {
      console.error('Excel parsing error:', error);
      return {
        success: false,
        imported: 0,
        failed: 0,
        errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
  
  static async parseCSVFile(fileBuffer: Buffer, userId: number, accountId?: number): Promise<ImportResult> {
    return new Promise((resolve) => {
      const csvText = fileBuffer.toString('utf-8');
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.toLowerCase().replace(/\s+/g, ''),
        complete: async (results) => {
          if (results.errors.length > 0) {
            resolve({
              success: false,
              imported: 0,
              failed: 0,
              errors: results.errors.map(err => `CSV parsing error: ${err.message}`)
            });
            return;
          }
          
          const result = await this.processPostsData(results.data, userId, accountId);
          resolve(result);
        },
        error: (error: any) => {
          resolve({
            success: false,
            imported: 0,
            failed: 0,
            errors: [`Failed to parse CSV file: ${error.message}`]
          });
        }
      });
    });
  }
  
  private static async processPostsData(posts: any[], userId: number, accountId?: number): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let failed = 0;
    
    // Get blacklist to prevent importing cancelled posts
    const blacklistedPosts = await storage.query('SELECT content_title FROM post_blacklist WHERE account_id = $1', [accountId]);
    const blacklistSet = new Set(blacklistedPosts.rows.map((row: any) => row.content_title.toLowerCase()));
    console.log(`🚫 Post blacklist loaded: ${blacklistSet.size} banned titles for account ${accountId}`);
    
    // Get user's Facebook accounts
    const userAccounts = await storage.getFacebookAccounts(userId);
    console.log('User accounts:', userAccounts);
    const accountMap = new Map(Array.isArray(userAccounts) ? userAccounts.map((acc: any) => [acc.name.toLowerCase(), acc]) : []);
    
    // Get user's custom labels
    const userLabels = await storage.getCustomLabels(userId);
    console.log('User labels:', userLabels);
    const labelMap = new Map(Array.isArray(userLabels) ? userLabels.map((label: any) => [label.name.toLowerCase(), label]) : []);
    
    for (let i = 0; i < posts.length; i++) {
      const validation = this.validatePostData(posts[i], i);
      
      if (!validation.isValid) {
        errors.push(...validation.errors);
        failed++;
        continue;
      }
      
      const postData = validation.data!;
      
      // Check blacklist to prevent importing cancelled posts
      if (blacklistSet.has(postData.content.toLowerCase().trim())) {
        console.log(`🚫 Row ${i + 1}: Post "${postData.content}" is blacklisted - skipping import`);
        errors.push(`Row ${i + 1}: Post "${postData.content}" was previously cancelled and cannot be imported`);
        failed++;
        continue;
      }
      
      try {
        // Use the selected account ID from frontend, or find account by name if accountId not provided
        let finalAccountId = accountId;
        
        if (!finalAccountId) {
          // Fallback to old behavior for backward compatibility
          if (postData.accountName && postData.accountName.trim() !== '') {
            const account = accountMap.get(postData.accountName.toLowerCase());
            if (account) {
              finalAccountId = account.id;
            } else {
              // Try partial matching
              const partialMatch = userAccounts.find((acc: any) => 
                acc.name.toLowerCase().includes(postData.accountName!.toLowerCase()) ||
                postData.accountName!.toLowerCase().includes(acc.name.toLowerCase())
              );
              
              if (partialMatch) {
                finalAccountId = partialMatch.id;
                console.log(`Row ${i + 1}: Using partial match "${partialMatch.name}" for "${postData.accountName!}"`);
              } else if (userAccounts.length > 0) {
                // Use first available account as fallback
                finalAccountId = userAccounts[0].id;
                console.log(`Row ${i + 1}: Account "${postData.accountName!}" not found, using default account "${userAccounts[0].name}"`);
              } else {
                errors.push(`Row ${i + 1}: No Facebook accounts available. Please connect a Facebook account first.`);
                failed++;
                continue;
              }
            }
          } else if (userAccounts.length > 0) {
            // Use first available account if no account specified
            finalAccountId = userAccounts[0].id;
          } else {
            errors.push(`Row ${i + 1}: No Facebook accounts available. Please connect a Facebook account first.`);
            failed++;
            continue;
          }
        }
        
        // Process custom labels - store as label names for Meta Insights
        const labelNames: string[] = [];
        if (postData.customLabels && typeof postData.customLabels === 'string' && postData.customLabels.trim().length > 0) {
          const rawLabels = postData.customLabels.split(',').map(name => name.trim()).filter(name => name.length > 0);
          labelNames.push(...rawLabels);
          console.log(`Row ${i + 1}: Processing custom labels for Meta Insights:`, rawLabels);
        }
        
        // Process YouTube videos during import - download and prepare for Facebook upload
        let processedMediaUrl = postData.mediaUrl;
        let processedMediaType = postData.mediaType;
        
        if (postData.mediaUrl && YouTubeHelper.isYouTubeUrl(postData.mediaUrl)) {
          console.log(`🎥 Row ${i + 1}: Processing YouTube video for Excel import: ${postData.mediaUrl}`);
          
          try {
            // Use the video processor to handle YouTube download
            const videoResult = await VideoProcessor.processVideo(postData.mediaUrl);
            
            if (videoResult.success && videoResult.processedUrl) {
              console.log(`✅ Row ${i + 1}: YouTube video processed successfully`);
              processedMediaUrl = videoResult.processedUrl;
              // Preserve user's mediaType for YouTube videos (could be 'reel' for YouTube Shorts)
              processedMediaType = postData.mediaType || 'video';
              
              // Add cleanup function to the post metadata for later cleanup
              if (videoResult.cleanup) {
                // Store cleanup info in metadata for scheduled cleanup
                console.log(`📋 Row ${i + 1}: Video file will be cleaned up after Facebook upload`);
              }
            } else {
              console.log(`❌ Row ${i + 1}: YouTube video processing failed: ${videoResult.error}`);
              errors.push(`Row ${i + 1}: YouTube video processing failed: ${videoResult.error || 'Unknown video processing error'}`);
              failed++;
              continue;
            }
          } catch (videoError) {
            console.error(`Row ${i + 1}: Video processing error:`, videoError);
            errors.push(`Row ${i + 1}: Failed to process YouTube video: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`);
            failed++;
            continue;
          }
        } else if (postData.mediaUrl && UniversalMediaDownloadService.isSupportedUrl(postData.mediaUrl)) {
          const platform = this.detectPlatform(postData.mediaUrl);
          console.log(`🔄 Row ${i + 1}: ${platform} media detected for Excel import: ${postData.mediaUrl}`);
          console.log(`📝 Row ${i + 1}: User specified mediaType: ${postData.mediaType || 'auto-detect'}`);
          
          // For universal media (Google Drive, SharePoint, Facebook), preserve the user's specified mediaType
          // If no mediaType specified, default to 'video' for backward compatibility
          processedMediaUrl = postData.mediaUrl;
          processedMediaType = postData.mediaType || 'video';
          
          console.log(`✅ Row ${i + 1}: ${platform} media URL preserved with mediaType: ${processedMediaType}`);
        }
        
        // Parse date and convert from IST to UTC for storage
        const dateMatch = postData.scheduledFor.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        let scheduledDate: Date;
        
        if (dateMatch) {
          const [, year, month, day, hours, minutes, seconds] = dateMatch;
          // Create date in IST and convert to UTC for storage
          const istDate = new Date(
            parseInt(year), 
            parseInt(month) - 1, 
            parseInt(day), 
            parseInt(hours), 
            parseInt(minutes), 
            parseInt(seconds)
          );
          
          // Convert IST to UTC (subtract 5 hours 30 minutes)
          scheduledDate = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
          
          console.log(`IST input: ${postData.scheduledFor}`);
          console.log(`Local IST date: ${istDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
          console.log(`Stored as UTC: ${scheduledDate.toISOString()}`);
        } else {
          scheduledDate = new Date(postData.scheduledFor);
          console.log(`Fallback date creation: ${scheduledDate.toISOString()}`);
        }
        
        // Retry logic for database operations to handle connection issues
        let newPost;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            newPost = await storage.createPost({
              content: postData.content,
              scheduledFor: scheduledDate,
              userId: userId,
              accountId: finalAccountId,
              status: 'scheduled',
              language: postData.language || 'EN',
              mediaUrl: processedMediaUrl,
              mediaType: processedMediaType,
              labels: labelNames  // Store custom labels for Meta Insights
            });
            break; // Success, exit retry loop
          } catch (dbError: any) {
            retryCount++;
            console.warn(`Row ${i + 1}: Database operation attempt ${retryCount} failed:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              throw new Error(`Database operation failed after ${maxRetries} attempts: ${dbError.message}`);
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
        
        // Log import activity with retry logic
        const isYouTubeVideo = postData.mediaUrl && YouTubeHelper.isYouTubeUrl(postData.mediaUrl);
        const activityDescription = isYouTubeVideo 
          ? `Post imported from Excel/CSV with YouTube video: "${postData.content.substring(0, 50)}${postData.content.length > 50 ? '...' : ''}"`
          : `Post imported from Excel/CSV: "${postData.content.substring(0, 50)}${postData.content.length > 50 ? '...' : ''}"`;
        
        retryCount = 0;
        while (retryCount < maxRetries) {
          try {
            await storage.createActivity({
              userId: userId,
              type: 'bulk_import',
              description: activityDescription,
              metadata: {
                postId: newPost!.id,
                source: 'excel_csv_import',
                scheduledFor: postData.scheduledFor,
                account: postData.accountName,
                labels: postData.customLabels,
                language: postData.language || 'EN',
                mediaType: processedMediaType || 'none',
                originalMediaUrl: postData.mediaUrl,
                processedMediaUrl: processedMediaUrl,
                youtubeProcessed: isYouTubeVideo
              }
            });
            break; // Success, exit retry loop
          } catch (dbError: any) {
            retryCount++;
            console.warn(`Row ${i + 1}: Activity logging attempt ${retryCount} failed:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              console.error(`Activity logging failed after ${maxRetries} attempts, continuing without activity log`);
              break; // Don't fail the entire import for activity logging
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
        
        imported++;
      } catch (error) {
        console.error('Error creating post:', error);
        errors.push(`Row ${i + 1}: Failed to create post - ${error instanceof Error ? error.message : 'Unknown error'}`);
        failed++;
      }
    }
    
    // Create summary activity with retry logic
    let summaryRetryCount = 0;
    const maxSummaryRetries = 3;
    
    while (summaryRetryCount < maxSummaryRetries) {
      try {
        await storage.createActivity({
          userId: userId,
          type: 'bulk_import_summary',
          description: `Bulk import completed: ${imported} posts imported, ${failed} failed`,
          metadata: {
            imported,
            failed,
            errors: errors.length,
            source: 'excel_csv_import'
          }
        });
        break; // Success, exit retry loop
      } catch (dbError: any) {
        summaryRetryCount++;
        console.warn(`Summary activity creation attempt ${summaryRetryCount} failed:`, dbError.message);
        
        if (summaryRetryCount >= maxSummaryRetries) {
          console.error(`Summary activity creation failed after ${maxSummaryRetries} attempts, continuing without summary log`);
          break; // Don't fail the entire import for summary logging
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, summaryRetryCount) * 1000));
      }
    }
    
    return {
      success: imported > 0,
      imported,
      failed,
      errors,
      data: posts
    };
  }
  
  static convertGoogleDriveLink(url: string): string {
    try {
      // Extract file ID from various Google Drive URL formats
      let fileId = '';
      
      if (url.includes('/file/d/')) {
        // Format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
      } else if (url.includes('id=')) {
        // Format: https://drive.google.com/open?id=FILE_ID
        const match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
      }
      
      if (fileId) {
        // Convert to direct download link
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
      
      return url; // Return original if couldn't parse
    } catch (error) {
      console.error('Error converting Google Drive link:', error);
      return url;
    }
  }

  /**
   * Detect platform from media URL
   */
  private static detectPlatform(url: string): string {
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      return 'google_drive';
    }
    if (url.includes('sharepoint.com') || url.includes('1drv.ms') || url.includes('onedrive.live.com')) {
      return 'sharepoint';
    }
    if (url.includes('facebook.com') || url.includes('fb.com')) {
      return 'facebook';
    }
    return 'unknown';
  }

  static generateTemplate(): Buffer {
    const accountName = 'Your Facebook Page Name';
    
    const templateData = [
      {
        content: 'Your post content here - this is the text that will be published',
        scheduledFor: '2:30 PM',
        customLabels: 'label1, label2',
        language: 'EN',
        mediaUrl: 'https://drive.google.com/file/d/1ABC123/view?usp=sharing',
        mediaType: 'image'
      },
      {
        content: 'SharePoint video example - works with OneDrive for Business',
        scheduledFor: '10:30 AM',
        customLabels: 'promotion, sale',
        language: 'HI',
        mediaUrl: 'https://company.sharepoint.com/sites/team/Documents/video.mp4',
        mediaType: 'video'
      },
      {
        content: 'Facebook video reposting - download and repost public Facebook videos',
        scheduledFor: '4:15 PM',
        customLabels: 'viral, content',
        language: 'EN',
        mediaUrl: 'https://www.facebook.com/watch/?v=123456789',
        mediaType: 'video'
      },
      {
        content: 'Example Reel content - short vertical video perfect for Reels',
        scheduledFor: '6:00 PM',
        customLabels: 'reel, trending',
        language: 'EN',
        mediaUrl: 'https://drive.google.com/file/d/1REEL456/view?usp=sharing',
        mediaType: 'reel'
      }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Posts Template');
    
    // Set column widths
    const colWidths = [
      { wch: 50 }, // content
      { wch: 20 }, // scheduledFor
      { wch: 25 }, // accountName
      { wch: 20 }, // customLabels
      { wch: 10 }, // language
      { wch: 30 }, // mediaUrl
      { wch: 15 }  // mediaType
    ];
    worksheet['!cols'] = colWidths;
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}