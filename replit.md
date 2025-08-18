# SocialFlow - Facebook Publishing Platform

## Overview
SocialFlow is an advanced social media publishing platform designed for Facebook business accounts. Its primary purpose is to offer intelligent content management and streamlined publishing workflows with an enhanced user experience. The project aims to provide comprehensive tools for Facebook account management, bulk post scheduling, real-time analytics, and robust media handling, focusing on efficient and reliable content delivery to Facebook.

## User Preferences
- Direct dashboard access without login requirements
- Simplified Excel import workflow with frontend page selection
- Clean, production-ready UI design
- Comprehensive error handling and user feedback
- CRITICAL: Videos must upload as actual media files to Facebook, never as text links
- QUALITY PRIORITY: Video quality preservation is main concern - no compression desired
- REQUIRED FLOW: Download Google Drive videos → Upload to Facebook with original quality preserved
- TECHNICAL: Support videos up to 1GB via Facebook chunked upload API with zero compression
- Use Alright Tamil page for testing video uploads and demonstrations
- Prefer robust HTTP download methods over FFmpeg when possible
- FIXED: Photo uploads from Google Drive now work via CSV (using SimpleFacebookPhotoService)
- ENHANCED: Automatic content detection (photo/video/reel) from Google Drive links in CSV
- RESOLVED: JavaScript "require is not defined" errors in upload services
- NEW (Aug 10, 2025): Full Reels API integration in CSV import system - users can specify "reel" in mediaType column for Reels uploads
- ENHANCED (Aug 10, 2025): CSV preview now displays Post Type column showing content type (Post, Image, Video, Reel) with visual indicators
- FIXED (Aug 10, 2025): Resolved Reels API authorization issues with intelligent fallback to video uploads when Reels permissions not available
- IMPROVED (Aug 10, 2025): Enhanced error handling for Facebook API authorization errors with user-friendly messaging
- UPDATED (Aug 10, 2025): Implemented proper Facebook Reels API following official documentation - using rupload.facebook.com with OAuth headers and correct upload flow
- ENHANCED (Aug 10, 2025): Added comprehensive Reels permissions setup guide and API v23.0 compatibility
- FIXED (Aug 10, 2025): Resolved Facebook Reels minimum height requirement (960px) - added video validation and automatic upscaling
- OPTIMIZED (Aug 10, 2025): Eliminated unnecessary FFmpeg conversions by checking video requirements first, only processing when needed
- NEW (Aug 18, 2025): Complete Reports feature implementation with publishing bucket analytics showing "Date uploaded – date published (if failed then blank) – Published page – content bucket (from custom label) – published link"
- ENHANCED (Aug 18, 2025): Advanced calendar-based date filtering in Reports with presets (Today, This Week, This Month) and unified custom date range selection in single calendar layout
- IMPROVED (Aug 18, 2025): Enhanced upcoming posts view with Facebook page names display and delete functionality for scheduled posts with detailed confirmation dialogs
- ENHANCED (Aug 18, 2025): Added comprehensive filtering to AllPosts page including date range filters (Today, This Week, This Month, Custom Range) and page filters similar to Reports section
- NEW (Aug 18, 2025): Complete Facebook video download and upload system implementation with network-based extraction, bypassing Puppeteer dependencies for reliable server operation. Successfully tested with Alright Naari video upload to Alright Tamil page (Post ID: 795338606252960)
- ENHANCED (Aug 18, 2025): Automatic media link detection system for CSV imports - system now automatically detects and processes Google Drive and Facebook video links without manual mediaType specification. Facebook videos are automatically downloaded during CSV import and converted to local files for reliable Facebook re-upload
- SUCCESSFUL (Aug 18, 2025): Facebook video download system fully operational - successfully downloading Facebook videos (36MB files) during CSV import with automatic media type detection. System correctly identifies Facebook video URLs and converts them to local files for Facebook re-upload. Validation system updated to handle local file paths properly, bypassing URL validation for downloaded Facebook videos
- COMPLETE (Aug 18, 2025): Automatic media link detection system fully functional - Facebook and Google Drive video links are automatically detected during CSV import without manual mediaType specification. System seamlessly processes mixed media types in CSV files

## System Architecture
The platform is built with a React frontend (TypeScript, shadcn/ui, Wouter), a Node.js Express backend, and a PostgreSQL database utilizing Drizzle ORM. Core functionalities include:
- **UI/UX**: Clean, production-ready design using shadcn/ui components.
- **Authentication**: Simplified authentication for Facebook account management.
- **Data Management**: PostgreSQL with Drizzle ORM for robust data handling.
- **Facebook Integration**: Deep integration with Meta Graph API for publishing, account management, and real-time analytics.
- **Content Scheduling**: Supports bulk post scheduling via Excel/CSV import with advanced date/time parsing and timezone management (IST to UTC conversion).
- **Media Handling**: Comprehensive system for media upload (images, videos), including:
    - Support for large video files via Facebook's resumable upload API (up to 1.75GB).
    - Intelligent upload method selection, prioritizing actual video file uploads over link posts.
    - Quality-preserving video processing, maintaining original video quality.
    - Integration of FFmpeg for high-quality video processing (e.g., 1080p60 YouTube downloads with audio merging).
- **Customization**: Custom labeling system compatible with Meta Insights for advanced reporting.
- **Reliability**: Enhanced robust scheduling service with database-driven intervals (15 seconds) that survives server restarts. **MAJOR IMPROVEMENT (Aug 10, 2025)**: Implemented MAXIMUM AGGRESSION anti-sleep system with 15-second self-pings, 20-second health checks, and 10-second activity pulses to prevent Replit server hibernation. System reduced average delays from 67 minutes to under 1 minute. Recovery mechanism detects and publishes overdue posts within 15 seconds of restart.
- **Error Handling**: Comprehensive error detection, retry logic with exponential backoff for database operations, and graceful handling of API errors and network issues.
- **Content Preservation**: Ensures original user-provided content is preserved across all upload methods (manual, CSV, video).
- **Security**: Virus scan bypass for Google Drive downloads and intelligent transformation of custom labels to avoid Facebook username restrictions.

## External Dependencies
- **Meta Graph API**: Used for all Facebook publishing, account management, and analytics features.
- **PostgreSQL**: Relational database for persistent storage.
- **Drizzle ORM**: Object-Relational Mapper for database interactions.
- **React**: Frontend JavaScript library.
- **shadcn/ui**: UI component library for React.
- **Wouter**: React router library.
- **Node.js Express**: Backend web application framework.
- **Papa Parse**: JavaScript CSV parser for handling Excel/CSV imports.
- **XLSX**: Library for parsing and generating Excel files.
- **@distube/ytdl-core**: Library for YouTube video downloading.
- **FFmpeg**: External tool for video processing, merging, and encoding.
- **Google Drive**: Integrated for video download and processing (with enhanced downloader and virus scan bypass).
- **Dropbox**: (Limited integration) Formerly used for video hosting.
- **Vimeo**: (Limited integration) Formerly used for video hosting.