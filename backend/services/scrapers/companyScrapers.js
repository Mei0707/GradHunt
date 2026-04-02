// services/scrapers/companyScrapers.js
const { scrapeLinkedInJobsPy } = require('./linkedinScraperPy');
const { scrapeIndeedJobsBrowser } = require('./indeedScraperBrowser');

const TARGET_JOBS_PER_SOURCE = 50;

const scrapeAllCompanyJobs = async (role, location) => {
  console.log(`Starting to scrape jobs for ${role} in ${location}`);
  
  try {
    const [linkedinJobs, indeedJobs] = await Promise.all([
        scrapeLinkedInJobsPy(role, location, TARGET_JOBS_PER_SOURCE),
        scrapeIndeedJobsBrowser(role, location, TARGET_JOBS_PER_SOURCE)
    ]);
    
    // Combine all jobs
    const allJobs = [...linkedinJobs, ...indeedJobs];
    
    console.log(`Total jobs found: ${allJobs.length}`);
    return allJobs;
  } catch (error) {
    console.error('Error in scrapeAllCompanyJobs:', error);
    return [];
  }
};

module.exports = {
  scrapeLinkedInJobsPy,
  scrapeAllCompanyJobs,
  scrapeIndeedJobsBrowser
};
