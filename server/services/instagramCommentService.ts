import axios from 'axios';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  like_count: number;
  replies?: InstagramComment[];
}

interface CommentAnalysis {
  totalComments: number;
  totalLikes: number;
  averageLikesPerComment: number;
  topCommenters: Array<{username: string, commentCount: number}>;
  engagementRate: number;
}

export class InstagramCommentService {
  private accessToken: string;
  private baseUrl = 'https://graph.instagram.com';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Extract Instagram Media ID from URL
   */
  private extractMediaId(url: string): string | null {
    try {
      // Extract media ID from Instagram URL
      const match = url.match(/\/reel\/([A-Za-z0-9_-]+)/);
      if (match) {
        return match[1];
      }
      return null;
    } catch (error) {
      console.error('Error extracting media ID:', error);
      return null;
    }
  }

  /**
   * Get comments for a specific Instagram media
   */
  async getComments(mediaUrl: string): Promise<InstagramComment[]> {
    try {
      const mediaId = this.extractMediaId(mediaUrl);
      if (!mediaId) {
        throw new Error('Could not extract media ID from URL');
      }

      const comments: InstagramComment[] = [];
      let nextPageUrl = `${this.baseUrl}/${mediaId}/comments?fields=id,text,timestamp,username,like_count,replies{id,text,timestamp,username,like_count}&access_token=${this.accessToken}`;

      while (nextPageUrl) {
        const response = await axios.get(nextPageUrl);
        const data = response.data;

        if (data.data) {
          comments.push(...data.data);
        }

        // Check for next page
        nextPageUrl = data.paging?.next || null;
      }

      return comments;
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw new Error(`Failed to fetch comments: ${error.message}`);
    }
  }

  /**
   * Analyze comments and generate insights
   */
  analyzeComments(comments: InstagramComment[]): CommentAnalysis {
    const totalComments = comments.length;
    const totalLikes = comments.reduce((sum, comment) => sum + comment.like_count, 0);
    const averageLikesPerComment = totalComments > 0 ? totalLikes / totalComments : 0;

    // Count comments per user
    const userCommentCounts: {[username: string]: number} = {};
    comments.forEach(comment => {
      userCommentCounts[comment.username] = (userCommentCounts[comment.username] || 0) + 1;
    });

    // Get top commenters
    const topCommenters = Object.entries(userCommentCounts)
      .map(([username, count]) => ({ username, commentCount: count }))
      .sort((a, b) => b.commentCount - a.commentCount)
      .slice(0, 10);

    // Calculate engagement rate (simplified)
    const engagementRate = totalComments > 0 ? (totalLikes + totalComments) / totalComments : 0;

    return {
      totalComments,
      totalLikes,
      averageLikesPerComment,
      topCommenters,
      engagementRate
    };
  }

  /**
   * Export comments to Excel file
   */
  async exportToExcel(comments: InstagramComment[], analysis: CommentAnalysis, filename: string): Promise<string> {
    try {
      // Prepare data for Excel
      const commentData = comments.map((comment, index) => ({
        'Comment ID': comment.id,
        'Username': comment.username,
        'Comment Text': comment.text,
        'Timestamp': comment.timestamp,
        'Likes': comment.like_count,
        'Has Replies': comment.replies && comment.replies.length > 0 ? 'Yes' : 'No',
        'Reply Count': comment.replies ? comment.replies.length : 0
      }));

      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Add comments sheet
      const commentsSheet = XLSX.utils.json_to_sheet(commentData);
      XLSX.utils.book_append_sheet(workbook, commentsSheet, 'Comments');

      // Add analysis sheet
      const analysisData = [
        ['Metric', 'Value'],
        ['Total Comments', analysis.totalComments],
        ['Total Likes', analysis.totalLikes],
        ['Average Likes per Comment', analysis.averageLikesPerComment.toFixed(2)],
        ['Engagement Rate', analysis.engagementRate.toFixed(2)],
        ['', ''],
        ['Top Commenters', 'Comment Count']
      ];

      // Add top commenters
      analysis.topCommenters.forEach(commenter => {
        analysisData.push([commenter.username, commenter.commentCount]);
      });

      const analysisSheet = XLSX.utils.aoa_to_sheet(analysisData);
      XLSX.utils.book_append_sheet(workbook, analysisSheet, 'Analysis');

      // Save file
      const filePath = path.join(process.cwd(), 'temp', `${filename}.xlsx`);
      XLSX.writeFile(workbook, filePath);

      return filePath;
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      throw new Error(`Failed to export to Excel: ${error.message}`);
    }
  }

  /**
   * Process Instagram reel and export comments
   */
  async processReelComments(mediaUrl: string, creatorName: string, uniqueId: string): Promise<{
    filePath: string;
    analysis: CommentAnalysis;
    commentCount: number;
  }> {
    try {
      console.log(`🔍 Processing comments for ${creatorName} - ${uniqueId}`);
      
      // Get comments
      const comments = await this.getComments(mediaUrl);
      console.log(`📊 Found ${comments.length} comments`);

      // Analyze comments
      const analysis = this.analyzeComments(comments);
      console.log(`📈 Analysis complete: ${analysis.totalComments} comments, ${analysis.totalLikes} total likes`);

      // Export to Excel
      const filename = `${creatorName.replace(/\s+/g, '_')}_${uniqueId}`;
      const filePath = await this.exportToExcel(comments, analysis, filename);

      console.log(`✅ Excel file created: ${filePath}`);

      return {
        filePath,
        analysis,
        commentCount: comments.length
      };
    } catch (error) {
      console.error(`❌ Error processing reel for ${creatorName}:`, error);
      throw error;
    }
  }
}


