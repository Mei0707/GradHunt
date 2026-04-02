// services/jobAggregationService.js
const { scrapeAllCompanyJobs } = require('./scrapers/companyScrapers');
const { rankJobsForResume } = require('./jobMatchingService');

const PAGE_SIZE = 20;
const CACHE_TTL_MS = 10 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 30 * 1000;
const jobSearchCache = new Map();

const buildCacheKey = (role, location) => `${role.trim().toLowerCase()}::${location.trim().toLowerCase()}`;

const paginateJobs = (jobs, page) => {
  const startIndex = (page - 1) * PAGE_SIZE;
  const paginatedJobs = jobs.slice(startIndex, startIndex + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));

  return {
    jobs: paginatedJobs,
    count: jobs.length,
    totalPages,
    currentPage: page,
    pageSize: PAGE_SIZE,
  };
};

const getCachedJobs = async (role, location) => {
  const cacheKey = buildCacheKey(role, location);
  const cachedEntry = jobSearchCache.get(cacheKey);
  const now = Date.now();

  if (cachedEntry && cachedEntry.expiresAt > now) {
    console.log(`Using cached jobs for: ${role} in ${location}`);
    return cachedEntry.jobs;
  }

  if (cachedEntry?.pendingPromise) {
    console.log(`Waiting for in-flight scrape for: ${role} in ${location}`);
    return cachedEntry.pendingPromise;
  }

  const pendingPromise = (async () => {
    const scrapedJobs = await scrapeAllCompanyJobs(role, location);
    scrapedJobs.sort((a, b) => new Date(b.created) - new Date(a.created));

    jobSearchCache.set(cacheKey, {
      jobs: scrapedJobs,
      expiresAt: Date.now() + (scrapedJobs.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
    });

    console.log(
      `Cached ${scrapedJobs.length} jobs for ${role} in ${location} for ${
        scrapedJobs.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS
      }ms`
    );

    return scrapedJobs;
  })();

  jobSearchCache.set(cacheKey, {
    jobs: [],
    expiresAt: 0,
    pendingPromise,
  });

  try {
    return await pendingPromise;
  } catch (error) {
    jobSearchCache.delete(cacheKey);
    throw error;
  }
};

/**
 * Gets aggregated job listings from multiple company career sites
 * @param {string} role - Job role to search for
 * @param {string} location - Location to search in
 * @param {number} page - Page number for pagination
 * @returns {Object} - Object containing jobs and pagination info
 */
const getAggregatedJobs = async (role, location, page = 1, resumeProfile = null) => {
  try {
    console.log(`Aggregating jobs for: ${role} in ${location}, page ${page}`);

    const currentPage = parseInt(page);
    const scrapedJobs = await getCachedJobs(role, location);
    const rankedJobs = rankJobsForResume(scrapedJobs, resumeProfile);

    return paginateJobs(rankedJobs, currentPage);
  } catch (error) {
    console.error('Error in job aggregation:', error);
    // Return empty results on error
    return {
      jobs: [],
      count: 0,
      totalPages: 1,
      currentPage: parseInt(page),
      pageSize: PAGE_SIZE
    };
  }
};

module.exports = {
  getAggregatedJobs
};
