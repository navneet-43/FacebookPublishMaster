const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');
const cheerio = require('cheerio');

class CSVScraper {
  constructor(inputFile, outputFile) {
    this.inputFile = inputFile;
    this.outputFile = outputFile;
    this.results = [];
  }

  async scrapeUrl(url) {
    try {
      console.log(`🔍 Scraping: ${url}`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Extract common data points
      const data = {
        url: url,
        title: $('title').text().trim() || $('h1').text().trim() || 'No title found',
        description: $('meta[name="description"]').attr('content') || 
                    $('meta[property="og:description"]').attr('content') || 
                    $('p').first().text().trim().substring(0, 200) || 'No description found',
        image: $('meta[property="og:image"]').attr('content') || 
               $('img').first().attr('src') || 'No image found',
        author: $('meta[name="author"]').attr('content') || 
                $('meta[property="article:author"]').attr('content') || 
                $('.author').text().trim() || 'No author found',
        date: $('meta[property="article:published_time"]').attr('content') || 
              $('meta[name="date"]').attr('content') || 
              $('.date').text().trim() || 'No date found',
        keywords: $('meta[name="keywords"]').attr('content') || 'No keywords found',
        status: 'Success',
        scraped_at: new Date().toISOString()
      };

      console.log(`✅ Successfully scraped: ${data.title}`);
      return data;

    } catch (error) {
      console.error(`❌ Error scraping ${url}:`, error.message);
      return {
        url: url,
        title: 'Error',
        description: `Error: ${error.message}`,
        image: 'Error',
        author: 'Error',
        date: 'Error',
        keywords: 'Error',
        status: 'Failed',
        scraped_at: new Date().toISOString()
      };
    }
  }

  async processCSV() {
    return new Promise((resolve, reject) => {
      const urls = [];
      
      fs.createReadStream(this.inputFile)
        .pipe(csv())
        .on('data', (row) => {
          // Look for URL in any column
          const url = Object.values(row).find(value => 
            typeof value === 'string' && 
            (value.startsWith('http://') || value.startsWith('https://'))
          );
          
          if (url) {
            urls.push(url.trim());
          }
        })
        .on('end', async () => {
          console.log(`📊 Found ${urls.length} URLs to scrape`);
          
          // Process URLs with delay to be respectful
          for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`\n📝 Processing ${i + 1}/${urls.length}`);
            
            const result = await this.scrapeUrl(url);
            this.results.push(result);
            
            // Add delay between requests (1 second)
            if (i < urls.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          await this.saveResults();
          resolve();
        })
        .on('error', reject);
    });
  }

  async saveResults() {
    const csvWriter = createCsvWriter({
      path: this.outputFile,
      header: [
        {id: 'url', title: 'URL'},
        {id: 'title', title: 'Title'},
        {id: 'description', title: 'Description'},
        {id: 'image', title: 'Image'},
        {id: 'author', title: 'Author'},
        {id: 'date', title: 'Date'},
        {id: 'keywords', title: 'Keywords'},
        {id: 'status', title: 'Status'},
        {id: 'scraped_at', title: 'Scraped At'}
      ]
    });

    await csvWriter.writeRecords(this.results);
    console.log(`\n💾 Results saved to: ${this.outputFile}`);
    console.log(`📈 Successfully scraped: ${this.results.filter(r => r.status === 'Success').length}/${this.results.length} URLs`);
  }
}

// Usage
async function main() {
  const inputFile = process.argv[2] || 'input_urls.csv';
  const outputFile = process.argv[3] || 'scraped_results.csv';
  
  console.log('🚀 CSV Scraper Started');
  console.log(`📁 Input file: ${inputFile}`);
  console.log(`📁 Output file: ${outputFile}`);
  
  const scraper = new CSVScraper(inputFile, outputFile);
  
  try {
    await scraper.processCSV();
    console.log('\n🎉 Scraping completed successfully!');
  } catch (error) {
    console.error('\n💥 Error:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = CSVScraper;
