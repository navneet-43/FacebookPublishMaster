// Test chunked upload with a direct video file
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testChunkedUpload() {
  console.log('🧪 Testing chunked upload implementation...');
  
  try {
    const response = await fetch('http://localhost:5000/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId: 4,
        content: "Testing chunked upload with direct video URL",
        mediaUrl: "https://dl.dropboxusercontent.com/scl/fi/sample-video.mp4",
        mediaType: "video",
        status: "immediate"
      })
    });
    
    const result = await response.json();
    console.log('📊 Test result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testChunkedUpload();