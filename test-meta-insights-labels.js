// Test custom labels for Meta Insights reporting
import fetch from 'node-fetch';

async function testMetaInsightsLabels() {
  const pageId = '101307726083031';
  const accessToken = 'EAANfp3M29nsBOZC3jru5muwgm6rclhfT1Ru23o2F3ZBWxTNsbhJECgZA5BONjKqKNwZC9bDwrM6wBa7YfZACqPQUNt0eNZApCbIZB9WJPTVbDJHQdxhMZCOPZAdNbOMp6hjGbgEQ4RHUAYSXKpv4UBSZBHhDGPUmI4r9B3ZBm25Ob3DtxAsyqn3rXzZAvnclWnF6ZAl2I81QZD';
  
  try {
    const endpoint = `https://graph.facebook.com/v18.0/${pageId}/feed`;
    
    const postData = new URLSearchParams();
    postData.append('message', 'Test post for Meta Insights - Custom Labels Testing');
    postData.append('access_token', accessToken);
    
    // Add custom labels for Meta Insights tracking
    const customLabels = ['label1', 'label2', 'meta-insights-test'];
    postData.append('custom_labels', JSON.stringify(customLabels));
    
    console.log('Testing Meta Insights custom labels...');
    console.log('Custom Labels:', customLabels);
    
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
    
    console.log('SUCCESS: Post published with custom labels for Meta Insights');
    console.log('Post ID:', data.id);
    
    // Verify the post was created with custom labels
    const verifyEndpoint = `https://graph.facebook.com/v18.0/${data.id}?fields=id,message,custom_labels&access_token=${accessToken}`;
    const verifyResponse = await fetch(verifyEndpoint);
    const verifyData = await verifyResponse.json();
    
    console.log('Verification Data:', verifyData);
    
    return true;
    
  } catch (error) {
    console.error('Network Error:', error);
    return false;
  }
}

testMetaInsightsLabels();