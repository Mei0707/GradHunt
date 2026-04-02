// services/scrapers/companyScrapers.js
const { scrapeLinkedInJobsPy } = require('./linkedinScraperPy');
const { scrapeIndeedJobsBrowser } = require('./indeedScraperBrowser');

const LINKEDIN_TARGET_JOBS = 50;
const INDEED_TARGET_JOBS = 25;
const LINKEDIN_TIMEOUT_MS = 90000;
const INDEED_TIMEOUT_MS = 60000;

const buildSearchRole = (role, jobType = 'full-time') => {
  const normalizedRole = role.trim();

  if (jobType === 'intern') {
    return /\b(intern|internship|co-?op)\b/i.test(normalizedRole)
      ? normalizedRole
      : `${normalizedRole} intern`;
  }

  return normalizedRole.replace(/\b(intern|internship|co-?op)\b/gi, '').replace(/\s+/g, ' ').trim() || normalizedRole;
};

const withTimeout = (label, task, timeoutMs) =>
  Promise.race([
    task,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);

const scrapeAllCompanyJobs = async (role, location, jobType = 'full-time') => {
  const searchRole = buildSearchRole(role, jobType);
  console.log(`Starting to scrape jobs for ${searchRole} in ${location} (${jobType})`);
  
  try {
    const results = await Promise.allSettled([
      withTimeout(
        'LinkedIn scraper',
        scrapeLinkedInJobsPy(searchRole, location, LINKEDIN_TARGET_JOBS),
        LINKEDIN_TIMEOUT_MS
      ),
      withTimeout(
        'Indeed scraper',
        scrapeIndeedJobsBrowser(searchRole, location, INDEED_TARGET_JOBS),
        INDEED_TIMEOUT_MS
      ),
    ]);

    const linkedinJobs = results[0].status === 'fulfilled' ? results[0].value : [];
    const indeedJobs = results[1].status === 'fulfilled' ? results[1].value : [];

    if (results[0].status === 'rejected') {
      console.error('LinkedIn scraper failed:', results[0].reason);
    }

    if (results[1].status === 'rejected') {
      console.error('Indeed scraper failed:', results[1].reason);
    }

    console.log(`LinkedIn jobs found: ${linkedinJobs.length}`);
    console.log(`Indeed jobs found: ${indeedJobs.length}`);
    
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
