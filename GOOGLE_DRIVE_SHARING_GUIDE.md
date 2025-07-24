# Google Drive Video Sharing Guide

## Issue: Google Drive 404 Errors
Your Excel import failed because the Google Drive links are not publicly accessible.

## Current Problem URLs:
- File ID: `1Fl_HSrPtUiIPeNpaGJNrZ_nQc2iWhFz6` - Returns 404
- File ID: `1SycHTTIyQmwfdWbVdstkshtovIosFv9S` - Returns 404

## How to Fix Google Drive Sharing:

### Step 1: Make Files Publicly Accessible
1. Open your Google Drive file
2. Right-click → "Share"
3. Click "Change to anyone with the link"
4. Set permission to "Viewer" 
5. Copy the sharing URL

### Step 2: Supported URL Formats
The system accepts these Google Drive URL formats:
```
https://drive.google.com/file/d/FILE_ID/view?usp=sharing
https://drive.google.com/file/d/FILE_ID/view?usp=drive_link
https://drive.google.com/open?id=FILE_ID
```

### Step 3: Test Your Links
Before using in Excel, test that your links work:
- Open the link in an incognito/private browser window
- You should be able to download the file without logging in

## Alternative Solutions:

### Use YouTube Instead
For reliable video uploads, use YouTube URLs:
```
https://www.youtube.com/watch?v=VIDEO_ID
```

### Use Direct Video URLs
If you have videos hosted elsewhere with direct access:
```
https://example.com/video.mp4
```

## Current Status:
- Posts imported successfully but failed to publish due to Google Drive access issues
- System is ready to process videos once proper URLs are provided
- Facebook integration is working correctly