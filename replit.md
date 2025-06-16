# SocialFlow - Facebook Publishing Platform

## Overview
An advanced social media publishing platform for Facebook business accounts, offering intelligent content management and streamlined publishing workflows with enhanced user experience.

## Project Architecture
- **Frontend**: React with TypeScript, shadcn/ui components, Wouter routing
- **Backend**: Node.js Express server with simplified authentication
- **Database**: PostgreSQL with Drizzle ORM
- **APIs**: Meta Graph API integration for Facebook publishing
- **File Processing**: Excel/CSV import with Papa Parse and XLSX libraries

## Key Features
- Facebook account management and authentication
- Bulk post scheduling via Excel/CSV import
- Real-time dashboard with analytics
- Custom labeling system
- Multi-language support (EN, HI)
- Media upload and management
- Activity logging and tracking

## Recent Changes
**June 15, 2025**
- ✅ Successfully implemented Facebook page dropdown selector for Excel import
- ✅ Removed account name requirement from CSV template
- ✅ Updated backend to accept selected account ID from frontend
- ✅ Modified Excel parsing to use selected account instead of CSV data
- ✅ Simplified template to only require: Content, Scheduled Date, Custom Labels, Language, Media URL/Type
- ✅ Completed feature testing - 2 posts successfully imported using page selector
- ✅ User confirmed successful import of 2 posts with "Sivalik Vasudeva" page selection
- 🔧 Improved query client error handling and retry logic for dashboard stability
- ✅ Fixed time parsing to support "2:30 PM" format for same-day scheduling
- ✅ Fixed Google Drive link processing to convert sharing URLs to direct download format
- ✅ Fixed language metadata display in Recent Activity to show selected language properly
- ✅ Fixed timezone conversion issue causing 5.5-hour scheduling shifts in Excel import
- ✅ Applied UTC+5:30 timezone offset correction for accurate post scheduling
- ✅ Fixed timezone correction direction to subtract offset instead of adding
- ✅ Implemented manual UTC date creation to prevent timezone conversion entirely
- ✅ Added "View All Posts" page with comprehensive post management functionality
- ✅ Updated system to handle IST (Indian Standard Time) for scheduling
- ✅ Modified Excel import to interpret times as IST and convert to UTC for storage
- ✅ Fixed validation function conflicts preventing IST conversion
- ✅ Corrected existing posts to proper UTC storage times
- ✅ Implemented comprehensive Facebook publishing fix with overdue post processing
- ✅ Added automatic recovery system for posts that miss scheduled execution
- ✅ Verified Facebook API publishing working correctly with live posts
- ✅ Enhanced custom labels for Meta Insights reporting with Facebook API compliance
- ✅ Implemented proper label validation (25 char limit, max 10 labels per post)
- ✅ Custom labels from Excel imports now properly sent to Facebook's Meta Insights system

## Current Status
- Excel import feature with Facebook page selection is fully functional and user-verified
- Dashboard accessible without authentication requirements
- System successfully processing posts with proper account assignment
- Enhanced error handling implemented to prevent console errors
- Timezone conversion issue completely resolved - posts schedule at exact intended times
- Cleaned up incorrectly scheduled posts and restarted scheduling system
- Active scheduling system now monitoring 10 posts with correct times
- All Posts page provides comprehensive post management with filtering and search
- View All Scheduled Posts functionality working correctly

## User Preferences
- Direct dashboard access without login requirements
- Simplified Excel import workflow with frontend page selection
- Clean, production-ready UI design
- Comprehensive error handling and user feedback

## Technical Implementation Notes
- Excel import now accepts accountId parameter from frontend
- Backend processes selected account ID instead of parsing from CSV
- Template generation simplified to remove account name column
- Frontend dropdown populated from connected Facebook accounts