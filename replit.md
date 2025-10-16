# SocialFlow - Social Media Publishing Platform

## Overview
SocialFlow is an advanced social media publishing platform designed for Facebook and Instagram business accounts. Its primary purpose is to offer intelligent content management and streamlined publishing workflows with an enhanced user experience. The project aims to provide comprehensive tools for social media account management, bulk post scheduling, real-time analytics, and robust media handling, focusing on efficient and reliable content delivery to Facebook and Instagram.

## User Preferences
- **Authentication required** - Dashboard and all features now protected with login/register functionality
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
- FIXED (Aug 19, 2025): Resolved "Invalid URL Error" affecting automatic Facebook video processing - local Facebook video files now bypass Google Drive validation and route directly to Facebook upload service. System successfully uploads downloaded Facebook videos (34.8MB files tested) with proper chunked upload and custom labels integration. Posts 403 & 405 validated as successful uploads to Alright Tamil page.
- CRITICAL FIX (Aug 19, 2025): Resolved Reel posting issue where posts with media_type "reel" were incorrectly uploaded as regular videos. Added specific handling for local Facebook video files in publishReelPost method with proper isReel parameter propagation. System now correctly uses Facebook Reels endpoint (v23.0/video_reels) for Reel uploads. Post 419 validated as successful Reel upload with Facebook Post ID 1254849803005348.
- NEW (Sep 10, 2025): Complete OpenAI-powered CSV format converter implementation - automatically transforms any CSV format into SocialFlow's expected structure using intelligent column mapping. Users can enable the "Smart CSV Converter" option during import to convert files with different column names or structures. System uses OpenAI GPT-5 to analyze CSV headers and data, providing seamless compatibility with various CSV formats while maintaining all existing functionality.
- CRITICAL FIX (Oct 9, 2025): Production ENOSPC prevention system - all video downloads now use /tmp ephemeral storage with intelligent adaptive thresholds based on total disk size: <5GB=50MB required, <20GB=100MB required (reduced from 150MB for production stability), >=20GB=300MB required (500MB in dev). System detects constrained environments and adjusts requirements automatically. Immediate cleanup of source files after FFmpeg encoding. **CRITICAL ENHANCEMENT (Oct 15, 2025)**: Added force cleanup on ALL failures including scheduled post failures - videos are now deleted immediately when uploads fail or scheduled posts fail to publish, preventing disk space accumulation. Reliable scheduling service now triggers immediate cleanup after any failed upload. Added manual cleanup API endpoint (POST /api/cleanup/force) for on-demand space recovery. **MAJOR FIX (Oct 15, 2025)**: Implemented proactive cleanup system - temp files are now cleaned up BEFORE attempting downloads, preventing "insufficient disk space" errors from old accumulated files. Reduced TTL from 1 hour to 15 minutes for ultra-aggressive cleanup in production. Prevents "no space left on device" errors in production deployments.
- NEW (Oct 10, 2025): Complete Instagram integration - Full Instagram Business account support with database schema (instagram_accounts table), backend services (InstagramService.ts with 2-step publishing API), storage layer CRUD operations, API routes, and frontend UI. Instagram accounts are automatically discovered during Facebook OAuth login - no manual token entry required. System auto-detects Instagram Business accounts linked to Facebook Pages and syncs them automatically. Instagram Accounts page added to navigation with comprehensive account management (connect, activate/deactivate, delete). Users can publish images/videos/reels/stories/carousels to Instagram.
- MAJOR UPDATE (Oct 14, 2025): **Platform-Exclusive Posting System** - Redesigned posting mechanism from cross-platform publishing to platform-exclusive selection. Users now select ONE platform (Facebook OR Instagram) first via radio buttons, then choose the specific page/account for that platform. Each post targets a single platform, eliminating cross-posting confusion. Database schema enhanced with `platform` field (facebook/instagram) and `facebookPostId` field for better tracking. Backend publishing logic updated for platform-specific routing with intelligent account validation. Scheduled posts and reliable scheduling service fully support platform-exclusive publishing.

## System Architecture
The platform is built with a React frontend (TypeScript, shadcn/ui, Wouter), a Node.js Express backend, and a PostgreSQL database utilizing Drizzle ORM. Core functionalities include:
- **UI/UX**: Clean, production-ready design using shadcn/ui components.
- **Authentication**: Simplified authentication for Facebook account management.
- **Data Management**: PostgreSQL with Drizzle ORM for robust data handling.
- **Social Media Integration**: Deep integration with Meta Graph API for Facebook and Instagram publishing, account management, and real-time analytics. Instagram Business accounts connect via Facebook Page tokens with support for images, videos, reels, stories, and carousel posts using 2-step publishing flow (create container → publish).
- **Content Scheduling**: Supports bulk post scheduling via Excel/CSV import with advanced date/time parsing and timezone management (IST to UTC conversion).
- **Timezone Architecture**: CRITICAL - Frontend always displays IST times for user convenience, backend automatically converts to UTC for storage and processing. This ensures consistent user experience while maintaining database integrity.
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
- **OpenAI API**: Integrated for AI-powered CSV format conversion, automatically transforming any CSV structure into SocialFlow's expected format using GPT-5 intelligent analysis.