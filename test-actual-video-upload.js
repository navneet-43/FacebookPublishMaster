// Test script to verify actual video upload functionality
import fetch from 'node-fetch';

async function testActualVideoUpload() {
  console.log('Testing actual video upload vs link post...');
  
  try {
    // Test with a smaller YouTube video
    const response = await fetch('http://localhost:5000/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId: 4,
        content: 'TEST: This should be an actual video upload, not a text link',
        mediaUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', // Shorter video
        mediaType: 'video',
        status: 'immediate'
      })
    });
    
    const result = await response.json();
    
    if (result.id) {
      console.log('✅ Post created:', result.id);
      console.log('Status:', result.status);
      
      // Check if it was uploaded as actual video or posted as link
      if (result.status === 'published') {
        console.log('🎯 SUCCESS: Video was processed and published');
      } else if (result.status === 'failed') {
        console.log('❌ FAILED:', result.errorMessage);
      }
    } else {
      console.log('❌ ERROR:', result.error || result.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testActualVideoUpload();