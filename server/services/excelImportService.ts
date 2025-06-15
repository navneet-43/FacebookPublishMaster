import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { storage } from '../storage';
import { insertPostSchema, insertActivitySchema } from '@shared/schema';
import { z } from 'zod';

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
        
        // Handle time-only format like "2:30 PM"
        if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
          const today = new Date();
          const timeStr = dateStr.toUpperCase();
          let [time, period] = timeStr.split(/\s+/);
          let [hours, minutes] = time.split(':').map(Number);
          
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          
          date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        } else {
          // Parse as local time to avoid timezone shifts
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/)) {
            // Format: YYYY-MM-DD HH:MM:SS - parse as local time
            const [datePart, timePart] = dateStr.split(' ');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
            date = new Date(year, month - 1, day, hours, minutes, seconds);
          } else {
            date = new Date(dateStr);
          }
        }
      }
      
      if (isNaN(date.getTime())) {
        errors.push(`Row ${rowIndex + 1}: Invalid date format for scheduledFor. Use format: YYYY-MM-DD HH:MM:SS or time format like 2:30 PM`);
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
      
      // If it's just a time like "2:30 PM", combine with today's date
      if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
        const today = new Date();
        const timeStr = dateStr.toUpperCase();
        let [time, period] = timeStr.split(/\s+/);
        let [hours, minutes] = time.split(':').map(Number);
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        parsedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
      } else {
        // Parse as local time to avoid timezone shifts
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/)) {
          // Format: YYYY-MM-DD HH:MM:SS - parse as local time
          const [datePart, timePart] = dateStr.split(' ');
          const [year, month, day] = datePart.split('-').map(Number);
          const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
          parsedDate = new Date(year, month - 1, day, hours, minutes, seconds);
        } else {
          parsedDate = new Date(dateStr);
        }
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

    // Store as local time string to avoid timezone conversion
    const localTimeString = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')} ${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}:${String(parsedDate.getSeconds()).padStart(2, '0')}`;
    
    console.log(`Row ${rowIndex + 1} - Final stored time: ${localTimeString}`);

    const data: ExcelPostData = {
      content: content.trim(),
      scheduledFor: localTimeString,
      accountName: accountName.toString().trim(),
      customLabels: customLabels.toString().trim(),
      language: language.toString().trim() || 'EN',
      mediaUrl: processedMediaUrl,
      mediaType: mediaType.toString().trim() || undefined
    };
    
    return { isValid: true, errors: [], data };
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
      const dataRows = jsonData.slice(1) as any[][];
      
      const posts = dataRows.map((row: any[]) => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
        });
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
    
    // Get user's Facebook accounts
    const userAccounts = await storage.getFacebookAccounts(userId);
    const accountMap = new Map(userAccounts.map((acc: any) => [acc.name.toLowerCase(), acc]));
    
    // Get user's custom labels
    const userLabels = await storage.getCustomLabels(userId);
    const labelMap = new Map(userLabels.map((label: any) => [label.name.toLowerCase(), label]));
    
    for (let i = 0; i < posts.length; i++) {
      const validation = this.validatePostData(posts[i], i);
      
      if (!validation.isValid) {
        errors.push(...validation.errors);
        failed++;
        continue;
      }
      
      const postData = validation.data!;
      
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
        
        // Process custom labels
        const labelIds: number[] = [];
        if (postData.customLabels) {
          const labelNames = postData.customLabels.split(',').map(name => name.trim().toLowerCase());
          for (const labelName of labelNames) {
            const label = labelMap.get(labelName);
            if (label) {
              labelIds.push(label.id);
            }
          }
        }
        
        // Apply timezone offset correction to fix the scheduling issue
        // Subtract the timezone offset to keep the intended local time
        const timezoneOffset = 5.5 * 60; // 5.5 hours in minutes
        const originalDate = new Date(postData.scheduledFor);
        const correctedDate = new Date(originalDate.getTime() - (timezoneOffset * 60 * 1000));
        
        console.log(`Original time: ${originalDate.toISOString()} (${originalDate.toLocaleString()})`);
        console.log(`Corrected time: ${correctedDate.toISOString()} (${correctedDate.toLocaleString()})`);
        
        const newPost = await storage.createPost({
          content: postData.content,
          scheduledFor: correctedDate,
          userId: userId,
          accountId: finalAccountId,
          status: 'scheduled',
          language: postData.language || 'EN',
          mediaUrl: postData.mediaUrl,
          mediaType: postData.mediaType
        });
        
        // Log import activity
        await storage.createActivity({
          userId: userId,
          type: 'bulk_import',
          description: `Post imported from Excel/CSV: "${postData.content.substring(0, 50)}${postData.content.length > 50 ? '...' : ''}"`,
          metadata: {
            postId: newPost.id,
            source: 'excel_csv_import',
            scheduledFor: postData.scheduledFor,
            account: postData.accountName,
            labels: postData.customLabels,
            language: postData.language || 'EN',
            mediaType: postData.mediaType || 'none',
            mediaUrl: postData.mediaUrl
          }
        });
        
        imported++;
      } catch (error) {
        console.error('Error creating post:', error);
        errors.push(`Row ${i + 1}: Failed to create post - ${error instanceof Error ? error.message : 'Unknown error'}`);
        failed++;
      }
    }
    
    // Create summary activity
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
        content: 'Another example post with different scheduling',
        scheduledFor: '10:30 AM',
        customLabels: 'promotion, sale',
        language: 'HI',
        mediaUrl: 'https://drive.google.com/file/d/1XYZ789/view?usp=sharing',
        mediaType: 'video'
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