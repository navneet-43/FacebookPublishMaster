const fetch = require('node-fetch');

async function debugSharePointUrl() {
  const sharePointUrl = "https://ruskmedia-my.sharepoint.com/:v:/p/vratant/ERq7esC0T0hIltXuwlLrgEEBq__nbj3F2iVA-IarAILVeA?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJPbmVEcml2ZUZvckJ1c2luZXNzIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXciLCJyZWZlcnJhbFZpZXciOiJNeUZpbGVzTGlua0NvcHkifX0&e=zBF9Si";
  
  console.log('🔍 Testing SharePoint URL redirect handling...');
  
  try {
    // Step 1: Get the redirect without following it
    const response = await fetch(sharePointUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Headers:');
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    
    if (response.status === 302) {
      const redirectUrl = response.headers.get('location');
      console.log('\n📍 Redirect URL:', redirectUrl);
      
      if (redirectUrl) {
        const streamUrl = new URL(redirectUrl);
        console.log('🆔 Stream URL components:');
        console.log('  Host:', streamUrl.hostname);
        console.log('  Pathname:', streamUrl.pathname);
        console.log('  Search params:');
        streamUrl.searchParams.forEach((value, key) => {
          console.log(`    ${key}: ${value}`);
        });
        
        // Try to decode the 'id' parameter to get actual file path
        const id = streamUrl.searchParams.get('id');
        if (id) {
          console.log('\n🔗 File ID:', id);
          
          // Try to construct direct download URL
          const baseUrl = `${streamUrl.protocol}//${streamUrl.hostname}`;
          const downloadUrl = `${baseUrl}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(id)}`;
          console.log('🔄 Constructed download URL:', downloadUrl);
          
          // Test the download URL
          console.log('\n📥 Testing download URL...');
          const downloadResponse = await fetch(downloadUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          console.log('Download response status:', downloadResponse.status);
          console.log('Content-Length:', downloadResponse.headers.get('content-length'));
          console.log('Content-Type:', downloadResponse.headers.get('content-type'));
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugSharePointUrl();