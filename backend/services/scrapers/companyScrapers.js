// services/scrapers/companyScrapers.js
const { scrapeLinkedInJobsPy } = require('./linkedinScraperPy');

const scrapeAllCompanyJobs = async (role, location) => {
  console.log(`Starting to scrape jobs for ${role} in ${location}`);
  
  try {
    // Use LinkedIn scraper
    const linkedinJobs = await scrapeLinkedInJobsPy(role, location);
    
    // You can add more job sources here
    
    // Combine all jobs
    const allJobs = [...linkedinJobs];
    
    console.log(`Total jobs found: ${allJobs.length}`);
    return allJobs;
  } catch (error) {
    console.error('Error in scrapeAllCompanyJobs:', error);
    return [];
  }
};

module.exports = {
  scrapeLinkedInJobsPy,
  scrapeAllCompanyJobs
};