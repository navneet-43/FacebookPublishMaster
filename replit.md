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
- **Reliability**: Robust scheduling service with database-driven intervals (15 seconds) that survives server restarts and prevents Replit sleep mode through self-pinging and external monitoring.
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