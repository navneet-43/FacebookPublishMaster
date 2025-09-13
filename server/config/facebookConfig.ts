/**
 * Facebook API Configuration
 * Centralized configuration for Facebook Graph API and rupload endpoints
 */

// CRITICAL: Use v20.0 for all Facebook API endpoints including rupload
// v23.0 causes 404 errors with rupload.facebook.com
export const FB_API_VERSION = 'v20.0';

// Graph API endpoints
export const FB_GRAPH_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;
export const FB_GRAPH_VIDEO_BASE_URL = `https://graph-video.facebook.com/${FB_API_VERSION}`;

// Rupload endpoint for Reels and chunked uploads
export const FB_RUPLOAD_BASE_URL = `https://rupload.facebook.com/video-upload/${FB_API_VERSION}`;

/**
 * Construct rupload URL for a video ID
 * This is used as a fallback when Facebook doesn't return an upload_url
 */
export function constructRuploadUrl(videoId: string): string {
  const url = `${FB_RUPLOAD_BASE_URL}/${videoId}`;
  console.log(`📌 Constructed fallback rupload URL with ${FB_API_VERSION}: ${url}`);
  return url;
}

/**
 * Get Graph API URL for page video reels
 */
export function getReelsEndpoint(pageId: string): string {
  return `${FB_GRAPH_BASE_URL}/${pageId}/video_reels`;
}

/**
 * Get Graph API URL for page videos
 */
export function getVideosEndpoint(pageId: string): string {
  return `${FB_GRAPH_VIDEO_BASE_URL}/${pageId}/videos`;
}