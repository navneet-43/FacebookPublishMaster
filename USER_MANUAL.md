# SocialFlow User Manual
## Advanced Facebook Publishing Platform

### Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication & User Roles](#authentication--user-roles)
3. [Dashboard Overview](#dashboard-overview)
4. [Facebook Account Management](#facebook-account-management)
5. [Content Publishing](#content-publishing)
6. [CSV Import & Bulk Publishing](#csv-import--bulk-publishing)
7. [Google Sheets Integration](#google-sheets-integration)
8. [Video Upload & Management](#video-upload--management)
9. [Scheduling System](#scheduling-system)
10. [Analytics & Reports](#analytics--reports)
11. [Admin Panel](#admin-panel)
12. [Troubleshooting](#troubleshooting)

---

## Getting Started

### System Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- Facebook Business account with appropriate permissions

### Accessing SocialFlow
1. Navigate to your SocialFlow platform URL
2. Use your assigned login credentials
3. The platform automatically redirects based on your role level

---

## Authentication & User Roles

### Two-Level Authentication System

#### Admin Role
- **Access**: Full system administration
- **Capabilities**: 
  - User management (create, edit, delete users)
  - System configuration
  - All publishing features
  - Advanced analytics and reports
  - Facebook account management

#### User Role
- **Access**: Standard publishing features
- **Capabilities**:
  - Content publishing and scheduling
  - CSV imports
  - Basic analytics
  - Video uploads

### Default Login Credentials
- **Admin**: admin@socialflow.com / admin123
- **Users**: Contact your administrator for credentials

### Changing Passwords
1. Navigate to your profile settings
2. Select "Change Password"
3. Enter current and new password
4. Save changes

---

## Dashboard Overview

The main dashboard provides a comprehensive view of your publishing activities:

### Key Metrics Display
- **Scheduled Posts**: Number of posts awaiting publication
- **Published Today**: Posts successfully published in the last 24 hours
- **Connected Accounts**: Total Facebook accounts configured
- **Total Posts**: Lifetime post count

### Status Indicators
- **System Status**: Shows if the scheduling system is active
- **Account Status**: Displays Facebook account connection health
- **Recent Activity**: Timeline of recent publishing actions

---

## Facebook Account Management

### Connecting Facebook Accounts
1. Click "Connect Facebook Account" button
2. Authenticate with Facebook OAuth
3. Grant necessary permissions:
   - Manage pages
   - Publish content
   - Read insights
4. Select target pages for publishing

### Managing Multiple Pages
- View all connected Facebook pages
- Set default publishing targets
- Configure page-specific settings
- Monitor page health status

### Required Facebook Permissions
- `pages_manage_posts`: Post content to pages
- `pages_read_engagement`: Read post analytics
- `pages_show_list`: Access page information
- `business_management`: Manage business assets

---

## Content Publishing

### Single Post Creation
1. Navigate to "Create Post" section
2. Enter your content text
3. Add media (images/videos) if desired
4. Select target Facebook page
5. Choose publishing option:
   - **Publish Now**: Immediate publication
   - **Schedule**: Set future publication time

### Media Support
- **Images**: JPG, PNG, GIF (up to 10MB)
- **Videos**: MP4, MOV, AVI (up to 1GB)
- **Multiple Media**: Support for photo/video carousels

### Content Enhancement Features
- **Custom Labels**: Add metadata for analytics tracking
- **Link Previews**: Automatic link preview generation
- **Hashtag Suggestions**: Smart hashtag recommendations
- **Content Templates**: Pre-defined post formats

---

## CSV Import & Bulk Publishing

### Preparing Your CSV File

#### Required Columns
- **Content**: Post text content
- **Date**: Publication date (YYYY-MM-DD format)
- **Time**: Publication time (HH:MM format in 24-hour)
- **Page**: Target Facebook page name

#### Optional Columns
- **MediaURL**: Direct link to media files
- **MediaType**: Specify 'image', 'video', or 'reel'
- **Link**: External URL to include
- **Labels**: Custom labels for tracking (comma-separated)
- **Language**: Content language (default: English)

#### Example CSV Format
```csv
Content,Date,Time,Page,MediaURL,MediaType,Labels
"Check out our new product!",2025-08-21,14:30,My Business Page,https://example.com/image.jpg,image,"product,launch"
"Video demonstration",2025-08-21,16:00,My Business Page,https://drive.google.com/file/d/abc123,video,"demo,tutorial"
```

### CSV Import Process
1. Navigate to "Import CSV" section
2. Click "Choose File" and select your CSV
3. Review the preview table:
   - Verify content detection
   - Check media type recognition
   - Confirm scheduling times
4. Select target Facebook account
5. Click "Import Posts" to begin bulk creation

### Automatic Media Detection
SocialFlow automatically detects and processes:
- **Google Drive Videos**: Downloads and uploads to Facebook
- **Facebook Videos**: Re-downloads and uploads to your page
- **Direct Media URLs**: Processes images and videos
- **Reel Content**: Automatically formats for Facebook Reels

---

## Google Sheets Integration

### Setting Up Integration
1. Go to "Google Sheets" section
2. Click "Connect Google Account"
3. Authorize Google Sheets access
4. Select your target spreadsheet

### Importing from Google Sheets
1. Choose your connected spreadsheet
2. Select specific sheet/tab
3. Define data range (e.g., A1:H100)
4. Map columns to SocialFlow fields
5. Import and schedule posts

### Supported Google Sheets Features
- Real-time data sync
- Multiple worksheet support
- Custom column mapping
- Automatic data validation

---

## Video Upload & Management

### Supported Video Sources
- **Direct Upload**: Upload files from your computer
- **Google Drive**: Process videos from Google Drive links
- **Facebook Videos**: Download and re-upload Facebook videos
- **YouTube**: Download videos for Facebook republishing

### Video Processing Features
- **Quality Preservation**: Maintains original video quality
- **Format Conversion**: Automatic format optimization for Facebook
- **Chunk Upload**: Reliable upload for large files (up to 1GB)
- **Progress Tracking**: Real-time upload progress monitoring

### Facebook Reels Support
- **Automatic Detection**: Smart detection of vertical video content
- **Reels API Integration**: Native Facebook Reels publishing
- **Quality Requirements**: Automatic validation and optimization
- **Minimum Dimensions**: 960px height requirement enforcement

### Video Upload Process
1. Select "Upload Video" option
2. Choose video source (file, Google Drive, etc.)
3. Add caption and description
4. Select target Facebook page
5. Choose between regular video post or Reel format
6. Schedule or publish immediately

---

## Scheduling System

### Maximum Reliability Features
- **15-Second Intervals**: Ultra-frequent checking for maximum precision
- **Anti-Sleep System**: Prevents server hibernation with aggressive keep-alive
- **Recovery Mechanism**: Automatic detection and publication of overdue posts
- **Database Persistence**: Survives server restarts with full state recovery

### Scheduling Options
- **Immediate**: Publish right away
- **Custom DateTime**: Set specific date and time
- **Bulk Scheduling**: Import multiple scheduled posts via CSV
- **Timezone Support**: Automatic IST to UTC conversion

### Monitoring Scheduled Posts
- View all upcoming publications
- Edit scheduled content before publication
- Cancel or reschedule posts
- Track publication success/failure

---

## Analytics & Reports

### Available Reports
- **Publishing Analytics**: Success rates, timing analysis
- **Content Performance**: Engagement metrics per post
- **Account Health**: Facebook connection status
- **Activity Timeline**: Detailed action history

### Report Features
- **Date Range Filtering**: Custom time periods
- **Export Options**: Download reports as CSV/Excel
- **Real-time Updates**: Live data refresh
- **Custom Labels**: Track performance by content categories

### Key Metrics Tracked
- Publication success rates
- Content engagement
- Upload performance
- System reliability metrics
- User activity patterns

---

## Admin Panel

### User Management
- **Create Users**: Add new team members
- **Edit Permissions**: Modify user access levels
- **Reset Passwords**: Administrative password resets
- **Activity Monitoring**: Track user actions

### System Configuration
- **Facebook App Settings**: Configure API credentials
- **Scheduling Parameters**: Adjust checking intervals
- **Storage Management**: Monitor system storage usage
- **Backup Configuration**: Set up automated backups

### Advanced Features
- **System Health Monitoring**: Real-time system status
- **Log Management**: Access detailed system logs
- **Performance Analytics**: System performance metrics
- **Security Auditing**: User access logs and security events

---

## Troubleshooting

### Common Issues

#### "Video Upload Failed"
- **Cause**: File size too large or unsupported format
- **Solution**: 
  - Ensure video is under 1GB
  - Use supported formats (MP4, MOV, AVI)
  - Check internet connection stability

#### "Facebook Permission Denied"
- **Cause**: Insufficient Facebook permissions
- **Solution**:
  - Reconnect Facebook account
  - Grant all requested permissions
  - Contact page administrator for business account access

#### "Google Drive Download Failed"
- **Cause**: Private file or insufficient permissions
- **Solution**:
  - Ensure Google Drive file is publicly accessible
  - Use direct download links when possible
  - Check Google Drive sharing settings

#### "Scheduling System Inactive"
- **Cause**: Server hibernation or system restart
- **Solution**:
  - System automatically recovers within 15 seconds
  - Check system status in dashboard
  - Contact administrator if issue persists

### Error Codes Reference
- **401**: Authentication required - please log in again
- **403**: Insufficient permissions - contact administrator
- **429**: Rate limit exceeded - please wait and retry
- **500**: System error - contact technical support

### Getting Help
- **Technical Support**: Contact your system administrator
- **Facebook Issues**: Check Facebook Business Help Center
- **Feature Requests**: Submit via admin panel feedback form

---

## Best Practices

### Content Guidelines
- Keep posts under Facebook's character limits
- Use high-quality images and videos
- Include relevant hashtags and mentions
- Test posts with small audiences first

### Scheduling Recommendations
- Schedule posts during peak audience hours
- Maintain consistent posting frequency
- Use bulk import for efficiency
- Monitor publication success rates

### Security Best Practices
- Change default passwords immediately
- Use strong, unique passwords
- Log out when finished
- Report suspicious activity to administrators

### Performance Optimization
- Use compressed images when possible
- Schedule large video uploads during off-peak hours
- Regularly clean up old scheduled posts
- Monitor system resources usage

---

## Quick Reference

### Keyboard Shortcuts
- `Ctrl + N`: New post
- `Ctrl + I`: Import CSV
- `Ctrl + S`: Save draft
- `Ctrl + P`: Publish now

### Important Links
- Facebook Business Manager: https://business.facebook.com
- Facebook API Status: https://developers.facebook.com/status
- Google Drive: https://drive.google.com

### Support Contacts
- **Technical Issues**: [Your IT Support Email]
- **Account Problems**: [Your Admin Email]
- **Emergency Contact**: [24/7 Support Number]

---

*This manual is current as of August 2025. For the latest updates and features, check the system announcements in your dashboard.*