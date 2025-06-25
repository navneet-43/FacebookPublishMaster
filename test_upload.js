// Test the Google Drive video upload pipeline
const fetch = require('node-fetch');

async function testGoogleDriveUpload() {
  try {
    console.log('Testing Google Drive video upload...');
    
    const response = await fetch('http://localhost:5000/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: 4,
        content: "Debug test - Google Drive video",
        mediaUrl: "https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link",
        mediaType: "video",
        link: "",
        language: "hi",
        labels: [],
        collaborator: "",
        privacy: "public",
        boost: false,
        crosspost: false,
        crosspostTo: [],
        status: "immediate"
      })
    });
    
    const result = await response.json();
    console.log('Upload response:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testGoogleDriveUpload();