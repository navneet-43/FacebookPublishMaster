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
        date = new Date(scheduledFor);
      }
      
      if (isNaN(date.getTime())) {
        errors.push(`Row ${rowIndex + 1}: Invalid date format for scheduledFor. Use format: YYYY-MM-DD HH:MM:SS`);
      }
    }
    
    if (errors.length > 0) {
      return { isValid: false, errors };
    }
    
    // Parse the date correctly
    let parsedDate: Date;
    if (typeof scheduledFor === 'number') {
      parsedDate = new Date((scheduledFor - 25569) * 86400 * 1000);
    } else {
      parsedDate = new Date(scheduledFor);
    }
    
    const data: ExcelPostData = {
      content: content.trim(),
      scheduledFor: parsedDate.toISOString(),
      accountName: accountName.toString().trim(),
      customLabels: customLabels.toString().trim(),
      language: language.toString().trim() || 'EN',
      mediaUrl: mediaUrl.toString().trim() || undefined,
      mediaType: mediaType.toString().trim() || undefined
    };
    
    return { isValid: true, errors: [], data };
  }
  
  static async parseExcelFile(fileBuffer: Buffer, userId: number): Promise<ImportResult> {
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
      
      return await this.processPostsData(posts, userId);
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
  
  static async parseCSVFile(fileBuffer: Buffer, userId: number): Promise<ImportResult> {
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
          
          const result = await this.processPostsData(results.data, userId);
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
  
  private static async processPostsData(posts: any[], userId: number): Promise<ImportResult> {
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
        // Find Facebook account
        let accountId = null;
        if (postData.accountName && postData.accountName.trim() !== '') {
          const account = accountMap.get(postData.accountName.toLowerCase());
          if (account) {
            accountId = account.id;
          } else {
            // Try partial matching
            const partialMatch = userAccounts.find((acc: any) => 
              acc.name.toLowerCase().includes(postData.accountName!.toLowerCase()) ||
              postData.accountName!.toLowerCase().includes(acc.name.toLowerCase())
            );
            
            if (partialMatch) {
              accountId = partialMatch.id;
              console.log(`Row ${i + 1}: Using partial match "${partialMatch.name}" for "${postData.accountName!}"`);
            } else if (userAccounts.length > 0) {
              // Use first available account as fallback
              accountId = userAccounts[0].id;
              console.log(`Row ${i + 1}: Account "${postData.accountName!}" not found, using default account "${userAccounts[0].name}"`);
            } else {
              errors.push(`Row ${i + 1}: No Facebook accounts available. Please connect a Facebook account first.`);
              failed++;
              continue;
            }
          }
        } else if (userAccounts.length > 0) {
          // Use first available account if no account specified
          accountId = userAccounts[0].id;
        } else {
          errors.push(`Row ${i + 1}: No Facebook accounts available. Please connect a Facebook account first.`);
          failed++;
          continue;
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
        
        // Create the post
        const newPost = await storage.createPost({
          content: postData.content,
          scheduledFor: new Date(postData.scheduledFor),
          userId: userId,
          accountId: accountId,
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
            labels: postData.customLabels
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
  
  static generateTemplate(userAccounts?: any[]): Buffer {
    const accountName = userAccounts && userAccounts.length > 0 
      ? userAccounts[0].name 
      : 'Your Facebook Page Name';
    
    const templateData = [
      {
        content: 'Your post content here - this is the text that will be published',
        scheduledFor: '2024-12-15 14:00:00',
        accountName: accountName,
        customLabels: 'label1, label2',
        language: 'EN',
        mediaUrl: 'https://example.com/image.jpg (optional)',
        mediaType: 'image (optional)'
      },
      {
        content: 'Another example post with different scheduling',
        scheduledFor: '2024-12-16 10:30:00',
        accountName: accountName,
        customLabels: 'promotion, sale',
        language: 'HI',
        mediaUrl: '',
        mediaType: ''
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