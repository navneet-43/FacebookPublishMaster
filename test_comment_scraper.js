import axios from 'axios';

// Test data for your top 2 reels
const testData = {
  userId: "1", // You'll need to get this from your database
  reels: [
    {
      creatorName: "Radhika Bhide",
      url: "https://www.instagram.com/reel/DQHk0Xik-OF/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
      uniqueId: "001"
    },
    {
      creatorName: "Radhika Bhide", 
      url: "https://www.instagram.com/reel/DQBV47Rk9sE/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
      uniqueId: "002"
    }
  ]
};

async function testCommentScraper() {
  try {
    console.log('🚀 Testing Instagram Comment Scraper...');
    console.log('📊 Test Data:', JSON.stringify(testData, null, 2));
    
    // Make API call to your comment scraper
    const response = await axios.post('http://localhost:3001/api/comments/scrape', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success! Response:', JSON.stringify(response.data, null, 2));
    
    // Check if Excel files were created
    if (response.data.results) {
      response.data.results.forEach(result => {
        if (result.success) {
          console.log(`📁 Excel file created: ${result.filePath}`);
          console.log(`📈 Analysis: ${result.commentCount} comments, ${result.analysis.totalLikes} total likes`);
        } else {
          console.log(`❌ Failed: ${result.error}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n💡 Tip: Make sure your application is running on port 3001');
      console.log('   Run: npm run dev');
    }
    
    if (error.response?.status === 400) {
      console.log('\n💡 Tip: You need to connect your Facebook account first');
      console.log('   Go to: http://localhost:3001 and login with Facebook');
    }
  }
}

// Run the test
testCommentScraper();

