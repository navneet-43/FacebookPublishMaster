import ytdl from '@distube/ytdl-core';

async function analyzeYouTubeFormats(url) {
  try {
    console.log('🔍 Analyzing YouTube URL:', url);
    const info = await ytdl.getInfo(url);
    
    console.log('\n📺 VIDEO DETAILS:');
    console.log('  Title:', info.videoDetails.title);
    console.log('  Duration:', info.videoDetails.lengthSeconds + 's');
    console.log('  Author:', info.videoDetails.author.name);
    
    console.log('\n📊 ALL AVAILABLE FORMATS:');
    console.log('Total formats found:', info.formats.length);
    
    // Group formats by type
    const combinedFormats = info.formats.filter(f => f.hasVideo && f.hasAudio);
    const videoOnlyFormats = info.formats.filter(f => f.hasVideo && !f.hasAudio);
    const audioOnlyFormats = info.formats.filter(f => !f.hasVideo && f.hasAudio);
    
    console.log('\n🎥 COMBINED VIDEO+AUDIO FORMATS (' + combinedFormats.length + '):');
    combinedFormats
      .sort((a, b) => parseInt(b.height || '0') - parseInt(a.height || '0'))
      .forEach((f, i) => {
        const quality = f.qualityLabel || (f.height ? f.height + 'p' : 'unknown');
        const size = f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown';
        const fps = f.fps ? ` (${f.fps}fps)` : '';
        const bitrate = f.bitrate ? ` - ${Math.round(f.bitrate/1000)}kbps` : '';
        console.log(`  ${i+1}. ${quality}${fps} | ${f.container} | ${size}${bitrate}`);
      });
    
    console.log('\n📹 VIDEO-ONLY FORMATS (' + videoOnlyFormats.length + '):');
    videoOnlyFormats
      .sort((a, b) => parseInt(b.height || '0') - parseInt(a.height || '0'))
      .slice(0, 10) // Show top 10 to avoid clutter
      .forEach((f, i) => {
        const quality = f.qualityLabel || (f.height ? f.height + 'p' : 'unknown');
        const size = f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown';
        const fps = f.fps ? ` (${f.fps}fps)` : '';
        console.log(`  V${i+1}. ${quality}${fps} | ${f.container} | ${size}`);
      });
    
    // Find the highest quality available
    const allVideoFormats = [...combinedFormats, ...videoOnlyFormats];
    const maxHeight = Math.max(...allVideoFormats.map(f => parseInt(f.height || '0')));
    const maxCombinedHeight = Math.max(...combinedFormats.map(f => parseInt(f.height || '0')));
    
    console.log('\n🎯 QUALITY ANALYSIS:');
    console.log('  Highest overall quality:', maxHeight + 'p');
    console.log('  Highest combined quality:', maxCombinedHeight + 'p');
    console.log('  Quality gap:', (maxHeight - maxCombinedHeight) + 'p difference');
    
    if (maxHeight > maxCombinedHeight) {
      console.log('  ⚠️  Higher quality available as video-only (requires audio merging)');
    } else {
      console.log('  ✅ Best quality available as combined format');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing formats:', error.message);
  }
}

// Test with the video that's been showing 360p
const testUrl = 'https://www.youtube.com/watch?v=SzjGi6wcdy0';
analyzeYouTubeFormats(testUrl);