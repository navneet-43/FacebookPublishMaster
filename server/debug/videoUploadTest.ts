import { HootsuiteStyleFacebookService } from '../services/hootsuiteStyleFacebookService';
import { ActualVideoUploadService } from '../services/actualVideoUploadService';
import { storage } from '../storage';
import { createWriteStream, unlinkSync, existsSync } from 'fs';
import fetch from 'node-fetch';

/**
 * Debug script to test video upload issues
 */
export async function debugVideoUpload() {
  console.log('🔍 DEBUGGING VIDEO UPLOAD ISSUE');
  
  try {
    // Get a Facebook account from the database
    const accounts = await storage.getFacebookAccounts(3); // Default user ID
    if (accounts.length === 0) {
      console.log('❌ No Facebook accounts found');
      return;
    }
    
    const account = accounts[0];
    console.log(`📊 Testing with account: ${account.name} (${account.pageId})`);
    
    // Test 1: Validate page token
    console.log('\n🧪 TEST 1: Validating page access token');
    const isValid = await HootsuiteStyleFacebookService.validatePageToken(account.pageId, account.accessToken);
    console.log(`📊 Token valid: ${isValid}`);
    
    if (!isValid) {
      console.log('❌ Invalid token - this is likely the main issue');
      return;
    }
    
    // Test 2: Create a small test video file
    console.log('\n🧪 TEST 2: Creating test video file');
    const testVideoPath = '/tmp/debug_test_video.mp4';
    
    // Create a minimal valid MP4 file (1MB)
    const testBuffer = Buffer.alloc(1024 * 1024); // 1MB
    // Add MP4 header to make it a valid video file
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x6D, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
      0x6D, 0x70, 0x34, 0x31, 0x6D, 0x70, 0x34, 0x32,
      0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x00, 0x00
    ]);
    mp4Header.copy(testBuffer, 0);
    
    const writeStream = createWriteStream(testVideoPath);
    writeStream.write(testBuffer);
    writeStream.end();
    
    await new Promise(resolve => writeStream.on('finish', resolve));
    console.log(`📁 Test video created: ${testVideoPath} (1MB)`);
    
    // Test 3: Attempt standard upload
    console.log('\n🧪 TEST 3: Testing standard video upload');
    const uploadResult = await HootsuiteStyleFacebookService.uploadVideoFile(
      account.pageId,
      account.accessToken,
      testVideoPath,
      'Debug test video upload',
      ['debug', 'test'],
      'en'
    );
    
    console.log('📊 Upload result:', JSON.stringify(uploadResult, null, 2));
    
    if (uploadResult.success) {
      console.log('✅ SUCCESS: Video uploaded successfully');
      console.log(`📱 Facebook Video ID: ${uploadResult.postId}`);
    } else {
      console.log('❌ FAILURE: Video upload failed');
      console.log(`🔍 Error: ${uploadResult.error}`);
      
      // Test 4: Try chunked upload
      console.log('\n🧪 TEST 4: Testing chunked upload fallback');
      const chunkedResult = await HootsuiteStyleFacebookService.uploadLargeVideoFileChunked(
        account.pageId,
        account.accessToken,
        testVideoPath,
        'Debug test video upload (chunked)',
        ['debug', 'chunked'],
        'en'
      );
      
      console.log('📊 Chunked result:', JSON.stringify(chunkedResult, null, 2));
    }
    
    // Clean up test file
    if (existsSync(testVideoPath)) {
      unlinkSync(testVideoPath);
      console.log('🗑️ Test file cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
}

/**
 * Test Facebook API directly
 */
export async function testFacebookAPI() {
  console.log('🔍 TESTING FACEBOOK API DIRECTLY');
  
  try {
    const accounts = await storage.getFacebookAccounts(3);
    if (accounts.length === 0) {
      console.log('❌ No Facebook accounts found');
      return;
    }
    
    const account = accounts[0];
    
    // Test basic API access
    const testUrl = `https://graph.facebook.com/v18.0/${account.pageId}?access_token=${account.accessToken}`;
    const response = await fetch(testUrl);
    const data = await response.json();
    
    console.log('📊 Facebook API Response:', JSON.stringify(data, null, 2));
    
    if (response.ok && !data.error) {
      console.log('✅ Facebook API access working');
    } else {
      console.log('❌ Facebook API access failed');
      console.log(`🔍 Error: ${data.error?.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('❌ Facebook API test error:', error);
  }
}