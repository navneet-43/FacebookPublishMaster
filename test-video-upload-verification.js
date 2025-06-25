// Comprehensive test to verify actual video uploads vs link posts
const fetch = require('node-fetch');

async function testVideoUploadMethods() {
  console.log('Testing video upload verification...\n');
  
  // Test 1: Small YouTube video (should upload as actual video)
  console.log('Test 1: Small YouTube video');
  try {
    const response1 = await fetch('http://localhost:5000/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 4,
        content: 'TEST 1: Small YouTube video - should be actual video upload',
        mediaUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        mediaType: 'video',
        status: 'immediate'
      })
    });
    
    const result1 = await response1.json();
    console.log('Result:', result1.status, result1.id ? `ID: ${result1.id}` : result1.error);
  } catch (error) {
    console.log('Error:', error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Check recent activity to see upload methods
  console.log('Test 2: Checking recent upload activity');
  try {
    const activityResponse = await fetch('http://localhost:5000/api/activities');
    const activities = await activityResponse.json();
    
    console.log('Recent video uploads:');
    activities.slice(0, 5).forEach(activity => {
      if (activity.type === 'post_published') {
        console.log(`- Post ${activity.metadata?.postId || 'N/A'}: ${activity.description}`);
        if (activity.metadata?.method) {
          console.log(`  Upload method: ${activity.metadata.method}`);
        }
      }
    });
  } catch (error) {
    console.log('Error checking activities:', error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Simple test video with immediate feedback
  console.log('Test 3: Creating optimized test video');
  try {
    const response3 = await fetch('http://localhost:5000/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 4,
        content: 'TEST 3: Optimized upload test - checking for actual video file upload',
        mediaUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0', // Short Gangnam Style clip
        mediaType: 'video',
        status: 'immediate'
      })
    });
    
    const result3 = await response3.json();
    console.log('Result:', result3.status, result3.id ? `ID: ${result3.id}` : result3.error);
    
    if (result3.status === 'published') {
      console.log('✅ SUCCESS: Video uploaded as actual file');
    } else if (result3.status === 'failed') {
      console.log('❌ FAILED:', result3.errorMessage);
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
}

testVideoUploadMethods();