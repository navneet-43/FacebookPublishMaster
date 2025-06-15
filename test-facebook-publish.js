// Test Facebook publishing directly
import fetch from 'node-fetch';

async function testFacebookPublish() {
  const pageId = '116221244797028';
  const accessToken = 'EAANfp3M29nsBO4UGZC1Bv66Gry28EmZBDcKZC44cSzX7npeWAOCZBfp827DcG05eTwhzjZCWuEzGVWKElyQxBibdUefKQd7OTzFYyyNC7Dn4tBUxtJe0qkU0KBZCm6Ya8TqBSRZBthB40O6tDwB4OuhcuCM2S1hqhMCw4sAx7HAoCApLLPZCDvvtTm6McOTV3oClkL0ZD';
  
  try {
    const endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    
    const postData = new URLSearchParams();
    postData.append('message', 'Test post from SocialFlow - IST scheduling test');
    postData.append('access_token', accessToken);
    
    console.log('Testing Facebook API publish...');
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postData.toString()
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Facebook API Error:', data.error);
      return false;
    }
    
    console.log('SUCCESS: Post published with ID:', data.id);
    return true;
    
  } catch (error) {
    console.error('Network Error:', error);
    return false;
  }
}

testFacebookPublish();