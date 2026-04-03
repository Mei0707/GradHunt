// services/scrapers/companyScrapers.js
const { scrapeLinkedInJobsPy } = require('./linkedinScraperPy');
const { scrapeIndeedJobsBrowser } = require('./indeedScraperBrowser');
const { scrapeZipRecruiterJobsBrowser } = require('./zipRecruiterScraperBrowser');

const LINKEDIN_TARGET_JOBS = 50;
const INDEED_TARGET_JOBS = 25;
const ZIPRECRUITER_TARGET_JOBS = 20;
const LINKEDIN_TIMEOUT_MS = 120000;
const INDEED_TIMEOUT_MS = 60000;
const ZIPRECRUITER_TIMEOUT_MS = 60000;

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

const buildLinkedInSearchRoles = (role, jobType = 'full-time') => {
  const variants = [role];
  const normalized = role.trim().toLowerCase();

  const addVariant = (value) => {
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return;
    }

    if (!variants.some((variant) => variant.toLowerCase() === cleaned.toLowerCase())) {
      variants.push(cleaned);
    }
  };

  if (normalized.includes('software engineer')) {
    addVariant(
      jobType === 'intern'
        ? role.replace(/software engineer/i, 'software developer')
        : role.replace(/software engineer/i, 'software developer')
    );
    addVariant(
      jobType === 'intern'
        ? role.replace(/software engineer/i, 'backend engineer')
        : role.replace(/software engineer/i, 'backend engineer')
    );
  }

  if (normalized.includes('data scientist')) {
    addVariant(role.replace(/data scientist/i, 'machine learning engineer'));
    addVariant(role.replace(/data scientist/i, 'data analyst'));
  }

  if (normalized.includes('product manager')) {
    addVariant(role.replace(/product manager/i, 'associate product manager'));
  }

  return variants.slice(0, 2);
};

const dedupeJobs = (jobs) => {
  const seen = new Set();

  return jobs.filter((job) => {
    const key = [
      job.source || 'unknown',
      (job.url || '').trim().toLowerCase(),
      (job.title || '').trim().toLowerCase(),
      (job.company || '').trim().toLowerCase(),
      (job.location || '').trim().toLowerCase(),
    ].join('::');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const scrapeLinkedInJobsExpanded = async (role, location, jobType) => {
  const roleVariants = buildLinkedInSearchRoles(role, jobType);
  const jobsPerVariant = Math.ceil(LINKEDIN_TARGET_JOBS / roleVariants.length);
  const allJobs = [];

  for (const [index, variant] of roleVariants.entries()) {
    console.log(`Running LinkedIn search variant: ${variant}`);
    const jobs = await scrapeLinkedInJobsPy(variant, location, jobsPerVariant);

    for (const job of jobs) {
      allJobs.push(job);
    }

    if (index < roleVariants.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  return dedupeJobs(allJobs).slice(0, LINKEDIN_TARGET_JOBS);
};

const scrapeAllCompanyJobs = async (role, location, jobType = 'full-time') => {
  const searchRole = buildSearchRole(role, jobType);
  console.log(`Starting to scrape jobs for ${searchRole} in ${location} (${jobType})`);
  
  try {
    const results = await Promise.allSettled([
      withTimeout(
        'LinkedIn scraper',
        scrapeLinkedInJobsExpanded(searchRole, location, jobType),
        LINKEDIN_TIMEOUT_MS
      ),
      withTimeout(
        'Indeed scraper',
        scrapeIndeedJobsBrowser(searchRole, location, INDEED_TARGET_JOBS),
        INDEED_TIMEOUT_MS
      ),
      withTimeout(
        'ZipRecruiter scraper',
        scrapeZipRecruiterJobsBrowser(searchRole, location, ZIPRECRUITER_TARGET_JOBS),
        ZIPRECRUITER_TIMEOUT_MS
      ),
    ]);

    const linkedinJobs = results[0].status === 'fulfilled' ? results[0].value : [];
    const indeedJobs = results[1].status === 'fulfilled' ? results[1].value : [];
    const zipRecruiterJobs = results[2].status === 'fulfilled' ? results[2].value : [];

    if (results[0].status === 'rejected') {
      console.error('LinkedIn scraper failed:', results[0].reason);
    }

    if (results[1].status === 'rejected') {
      console.error('Indeed scraper failed:', results[1].reason);
    }

    if (results[2].status === 'rejected') {
      console.error('ZipRecruiter scraper failed:', results[2].reason);
    }

    console.log(`LinkedIn jobs found: ${linkedinJobs.length}`);
    console.log(`Indeed jobs found: ${indeedJobs.length}`);
    console.log(`ZipRecruiter jobs found: ${zipRecruiterJobs.length}`);
    
    // Combine all jobs
    const allJobs = dedupeJobs([...linkedinJobs, ...indeedJobs, ...zipRecruiterJobs]);
    
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
  scrapeIndeedJobsBrowser,
  scrapeZipRecruiterJobsBrowser,
};
