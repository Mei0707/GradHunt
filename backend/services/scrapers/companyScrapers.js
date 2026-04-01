// services/scrapers/companyScrapers.js
const { scrapeLinkedInJobsPy } = require('./linkedinScraperPy');
const { scrapeIndeedJobsPy } = require('./indeedScraperPy');
const { scrapeIndeedJobsBrowser } = require('./indeedScraperBrowser');

const TARGET_JOBS_PER_SOURCE = 50;

const scrapeAllCompanyJobs = async (role, location) => {
  console.log(`Starting to scrape jobs for ${role} in ${location}`);
  
  try {
    const indeedJobsPromise = (async () => {
      try {
        return await scrapeIndeedJobsBrowser(role, location, TARGET_JOBS_PER_SOURCE);
      } catch (error) {
        console.error('Indeed browser scraper failed, falling back to Python scraper:', error.message);
        return scrapeIndeedJobsPy(role, location, TARGET_JOBS_PER_SOURCE);
      }
    })();

    const [linkedinJobs, indeedJobs] = await Promise.all([
        scrapeLinkedInJobsPy(role, location, TARGET_JOBS_PER_SOURCE),
        indeedJobsPromise
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
  scrapeIndeedJobsPy
};
