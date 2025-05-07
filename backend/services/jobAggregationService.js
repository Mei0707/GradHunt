// services/jobAggregationService.js
const { scrapeAllCompanyJobs } = require('./scrapers/companyScrapers');

/**
 * Gets aggregated job listings from multiple company career sites
 * @param {string} role - Job role to search for
 * @param {string} location - Location to search in
 * @param {number} page - Page number for pagination
 * @returns {Object} - Object containing jobs and pagination info
 */
const getAggregatedJobs = async (role, location, page = 1) => {
  try {
    console.log(`Aggregating jobs for: ${role} in ${location}, page ${page}`);
    
    // Get jobs from company career pages
    const scrapedJobs = await scrapeAllCompanyJobs(role, location);
    
    // Sort by date (newest first)
    scrapedJobs.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    // Implement pagination
    const pageSize = 25;
    const startIndex = (page - 1) * pageSize;
    const paginatedJobs = scrapedJobs.slice(startIndex, startIndex + pageSize);
    
    // Calculate total pages
    const totalPages = Math.max(1, Math.ceil(scrapedJobs.length / pageSize));
    
    return {
      jobs: paginatedJobs,
      count: scrapedJobs.length,
      totalPages: totalPages,
      currentPage: parseInt(page)
    };
  } catch (error) {
    console.error('Error in job aggregation:', error);
    // Return empty results on error
    return {
      jobs: [],
      count: 0,
      totalPages: 1,
      currentPage: parseInt(page)
    };
  }
};

module.exports = {
  getAggregatedJobs
};