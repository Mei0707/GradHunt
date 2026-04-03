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
const normalizeWhitespace = (value = '') => value.replace(/\s+/g, ' ').trim();
const SOURCE_PRIORITY = {
  LinkedIn: 4,
  ZipRecruiter: 3,
  Indeed: 2,
  Unknown: 1,
};

const normalizeLocation = (value = '') =>
  normalizeText(value)
    .replace(/\b(hybrid|remote|on-site|onsite)\b/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTitle = (value = '') =>
  normalizeText(value)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(full time|full-time|new grad|entry level)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCompany = (value = '') =>
  normalizeText(value)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const canonicalizeUrl = (rawUrl = '') => {
  if (!rawUrl) {
    return '';
  }

  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

    if (hostname.includes('linkedin.com')) {
      const jobMatch = url.pathname.match(/\/jobs\/view\/(\d+)/i);
      if (jobMatch) {
        return `linkedin:${jobMatch[1]}`;
      }
    }

    if (hostname.includes('indeed.com')) {
      const jk = url.searchParams.get('jk');
      if (jk) {
        return `indeed:${jk.toLowerCase()}`;
      }
    }

    if (hostname.includes('ziprecruiter.com')) {
      const cleanedPath = url.pathname.replace(/\/+$/, '').toLowerCase();
      if (cleanedPath) {
        return `ziprecruiter:${cleanedPath}`;
      }
    }

    url.search = '';
    url.hash = '';
    return `${hostname}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch (error) {
    return normalizeText(rawUrl);
  }
};

const buildExactJobKey = (job) => {
  const canonicalUrl = canonicalizeUrl(job.url || '');
  if (canonicalUrl) {
    return `url::${canonicalUrl}`;
  }

  return [
    'exact',
    normalizeTitle(job.title || ''),
    normalizeCompany(job.company || ''),
    normalizeLocation(job.location || ''),
  ].join('::');
};

const buildFuzzyJobKey = (job) =>
  [
    normalizeTitle(job.title || ''),
    normalizeCompany(job.company || ''),
    normalizeLocation(job.location || ''),
  ].join('::');

const getDescriptionLength = (job) => normalizeWhitespace(job.description || '').length;
const getSourcePriority = (job) => SOURCE_PRIORITY[job.source] || SOURCE_PRIORITY.Unknown;
const getQualityScore = (job) =>
  getDescriptionLength(job) +
  (job.salary_min || job.salary_max ? 40 : 0) +
  (job.time_posted ? 15 : 0) +
  getSourcePriority(job) * 10;

const mergeUniqueValues = (first = [], second = []) =>
  [...new Set([...first, ...second].filter(Boolean))];

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

  return jobs.filter((job) => {
    const idMatches =
      appliedJobIds.has(job.id) ||
      (Array.isArray(job.alternateIds) && job.alternateIds.some((id) => appliedJobIds.has(id)));
    const urlMatches =
      appliedJobUrls.has(job.url) ||
      (Array.isArray(job.alternateUrls) && job.alternateUrls.some((url) => appliedJobUrls.has(url)));

    return !idMatches && !urlMatches;
  });
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

const mergeDuplicateJobs = (jobs) => {
  const mergedByKey = new Map();

  for (const job of jobs) {
    const exactKey = buildExactJobKey(job);
    const fuzzyKey = buildFuzzyJobKey(job);
    const existing = mergedByKey.get(exactKey) || mergedByKey.get(fuzzyKey);

    if (!existing) {
      const normalizedJob = {
        ...job,
        description: normalizeWhitespace(job.description || ''),
        alternateIds: [job.id].filter(Boolean),
        alternateUrls: [job.url].filter(Boolean),
        sources: [job.source || 'Unknown'],
      };

      mergedByKey.set(exactKey, normalizedJob);
      mergedByKey.set(fuzzyKey, normalizedJob);
      continue;
    }

    const existingQuality = getQualityScore(existing);
    const incomingQuality = getQualityScore(job);
    const primaryJob = incomingQuality > existingQuality ? job : existing;
    const secondaryJob = primaryJob === existing ? job : existing;

    const mergedJob = {
      ...existing,
      ...primaryJob,
      description:
        getDescriptionLength(primaryJob) >= getDescriptionLength(secondaryJob)
          ? normalizeWhitespace(primaryJob.description || '')
          : normalizeWhitespace(secondaryJob.description || ''),
      salary_min: primaryJob.salary_min ?? secondaryJob.salary_min,
      salary_max: primaryJob.salary_max ?? secondaryJob.salary_max,
      salary_is_predicted: primaryJob.salary_is_predicted ?? secondaryJob.salary_is_predicted,
      time_posted: primaryJob.time_posted || secondaryJob.time_posted,
      num_applicants: primaryJob.num_applicants || secondaryJob.num_applicants,
      created: primaryJob.created || secondaryJob.created,
      alternateIds: mergeUniqueValues(existing.alternateIds, [job.id]),
      alternateUrls: mergeUniqueValues(existing.alternateUrls, [job.url]),
      sources: mergeUniqueValues(existing.sources, [job.source || 'Unknown']),
    };

    mergedJob.source =
      mergedJob.sources.length > 1 ? mergedJob.sources.join(' + ') : mergedJob.sources[0] || 'Unknown';

    mergedByKey.set(exactKey, mergedJob);
    mergedByKey.set(fuzzyKey, mergedJob);
  }

  return [...new Set(mergedByKey.values())];
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

  return mergeDuplicateJobs(results.flat());
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
    const rankedJobs = await rankJobsForResume(filteredJobs, resumeProfile);
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
