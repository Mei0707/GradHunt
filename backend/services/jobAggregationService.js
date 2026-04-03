// services/jobAggregationService.js
const { scrapeAllCompanyJobs } = require('./scrapers/companyScrapers');
const { rankJobsForResume } = require('./jobMatchingService');

const PAGE_SIZE = 18;
const CACHE_TTL_MS = 10 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 30 * 1000;
const jobSearchCache = new Map();
const MAX_RESUME_SEARCH_ROLES = 3;

const buildCacheKey = (role, location, jobType) =>
  `${role.trim().toLowerCase()}::${location.trim().toLowerCase()}::${jobType.trim().toLowerCase()}`;

const normalizeText = (value = '') => value.toLowerCase().trim();

const INTERNSHIP_PATTERN = /\b(intern|internship|co-?op|apprentice|summer intern|fall intern)\b/i;

const filterJobsByType = (jobs, jobType = 'full-time') => {
  if (jobType === 'intern') {
    return jobs.filter((job) =>
      INTERNSHIP_PATTERN.test(`${job.title || ''} ${job.description || ''}`)
    );
  }

  return jobs;
};

const filterAppliedJobs = (jobs, appliedJobIds = new Set(), appliedJobUrls = new Set()) => {
  if ((!appliedJobIds || appliedJobIds.size === 0) && (!appliedJobUrls || appliedJobUrls.size === 0)) {
    return jobs;
  }

  return jobs.filter((job) => !appliedJobIds.has(job.id) && !appliedJobUrls.has(job.url));
};

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

const dedupeJobs = (jobs) => {
  const seen = new Set();

  return jobs.filter((job) => {
    const key = [
      normalizeText(job.url || ''),
      normalizeText(job.title || ''),
      normalizeText(job.company || ''),
      normalizeText(job.location || ''),
    ].join('::');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const buildResumeSearchRoles = (baseRole, resumeProfile, jobType = 'full-time') => {
  if (!resumeProfile) {
    return [baseRole];
  }

  const candidateRoles = [
    baseRole,
    ...(resumeProfile.suggested_search_keywords || []),
    ...(resumeProfile.target_roles || []),
  ];
  const dedupedRoles = [];

  for (const role of candidateRoles) {
    const cleaned = (role || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      continue;
    }

    const hasInternHint = /\b(intern|internship|co-?op)\b/i.test(cleaned);

    if (jobType === 'full-time' && hasInternHint) {
      continue;
    }

    const normalized = normalizeText(cleaned);
    if (dedupedRoles.some((existingRole) => normalizeText(existingRole) === normalized)) {
      continue;
    }

    if (jobType === 'intern' && !/\b(intern|internship|co-?op)\b/i.test(cleaned)) {
      dedupedRoles.push(`${cleaned} intern`);
    } else {
      dedupedRoles.push(cleaned);
    }
  }

  if (dedupedRoles.length === 0) {
    if (jobType === 'intern' && !/\b(intern|internship|co-?op)\b/i.test(baseRole)) {
      return [`${baseRole} intern`];
    }

    return [baseRole];
  }

  return dedupedRoles.slice(0, MAX_RESUME_SEARCH_ROLES);
};

const getCachedJobs = async (role, location, jobType = 'full-time') => {
  const cacheKey = buildCacheKey(role, location, jobType);
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
    const scrapedJobs = await scrapeAllCompanyJobs(role, location, jobType);
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

const getJobsForSearchRoles = async (roles, location, jobType = 'full-time') => {
  const roleList = Array.isArray(roles) && roles.length > 0 ? roles : ['software engineer'];
  const results = await Promise.all(
    roleList.map(async (role) => {
      const jobs = await getCachedJobs(role, location, jobType);
      return jobs.map((job) => ({
        ...job,
        searchRole: role,
      }));
    })
  );

  return dedupeJobs(results.flat());
};

/**
 * Gets aggregated job listings from multiple company career sites
 * @param {string} role - Job role to search for
 * @param {string} location - Location to search in
 * @param {number} page - Page number for pagination
 * @returns {Object} - Object containing jobs and pagination info
 */
const getAggregatedJobs = async (
  role,
  location,
  page = 1,
  resumeProfile = null,
  jobType = 'full-time',
  options = {}
) => {
  try {
    console.log(`Aggregating jobs for: ${role} in ${location}, page ${page}, type ${jobType}`);

    const currentPage = parseInt(page);
    const searchedRoles = buildResumeSearchRoles(role, resumeProfile, jobType);
    console.log(`Using search roles: ${searchedRoles.join(', ')}`);
    const scrapedJobs = await getJobsForSearchRoles(searchedRoles, location, jobType);
    const filteredJobs = filterJobsByType(scrapedJobs, jobType);
    const rankedJobs = rankJobsForResume(filteredJobs, resumeProfile);
    const visibleJobs = options.hideApplied
      ? filterAppliedJobs(rankedJobs, options.appliedJobIds, options.appliedJobUrls)
      : rankedJobs;

    return {
      ...paginateJobs(visibleJobs, currentPage),
      searchedRoles,
    };
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
