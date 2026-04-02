/** 
// backend/controllers/jobController.js
const adzunaService = require('../services/adzunaService');

// Search for jobs with filters
const searchJobs = async (req, res) => {
  try {
    console.log('Request params:', req.query);

    // Extract query parameters from request
    const { role, location, distance, max_days_old, results_per_page, page } = req.query;

    // Prepare search parameters
    const params = {};
    if (role) params.what = role;
    if (location) params.where = location;
    if (distance) params.distance = parseInt(distance);
    if (max_days_old) params.max_days_old = parseInt(max_days_old);
    params.results_per_page = 25; // Always use 25 results per page
    params.page = page ? parseInt(page) : 1;

    console.log('Sending parameters to adzunaService:', params);

    // Call the service to search jobs
    const jobsData = await adzunaService.searchJobs(params);

    // Check if we have valid results
    if (!jobsData || !jobsData.results) {
      return res.status(400).json({
        error: 'Invalid response from Adzuna API',
        details: jobsData
      });
    }

    // Standardize job data format
    const formattedJobs = jobsData.results.map(job => ({
      id: job.id,
      title: job.title,
      company: job.company?.display_name || 'Unknown Company',
      location: job.location?.display_name || 'Unknown Location',
      description: job.description,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_is_predicted: job.salary_is_predicted,
      url: job.redirect_url,
      created: job.created,
      category: job.category?.label || 'Unknown Category'
    }));

    // Calculate total pages consistently
    const totalCount = parseInt(jobsData.count || 0);
    const resultsPerPage = 25; // Fixed number of results per page
    const totalPages = Math.max(1, Math.ceil(totalCount / resultsPerPage));

    console.log(`Total count: ${totalCount}, Results per page: ${resultsPerPage}, Total pages: ${totalPages}, Current page: ${params.page}`);

    // Return response
    res.json({
      jobs: formattedJobs,
      count: totalCount,
      mean: jobsData.mean,
      totalResults: totalCount,
      currentPage: params.page,
      resultsPerPage: resultsPerPage,
      totalPages: totalPages
    });
  } catch (error) {
    console.error('Error in job search controller:', error);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', JSON.stringify(error.response.data));

      return res.status(error.response.status).json({
        error: 'Error from Adzuna API',
        details: error.response.data,
        status: error.response.status
      });
    } else {
      return res.status(500).json({
        error: 'Error searching for jobs',
        details: error.message
      });
    }
  }
};

// Get details of a specific job
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const jobData = await adzunaService.getJobById(id);

    // Format job data
    const formattedJob = {
      id: jobData.id,
      title: jobData.title,
      company: jobData.company?.display_name || 'Unknown Company',
      location: jobData.location?.display_name || 'Unknown Location',
      description: jobData.description,
      salary_min: jobData.salary_min,
      salary_max: jobData.salary_max,
      salary_is_predicted: jobData.salary_is_predicted,
      url: jobData.redirect_url,
      created: jobData.created,
      category: jobData.category?.label || 'Unknown Category'
    };

    res.json(formattedJob);
  } catch (error) {
    console.error('Error getting job details:', error);
    res.status(500).json({ error: 'Error retrieving job details' });
  }
};

module.exports = {
  searchJobs,
  getJobById
};
**/

const jobAggregationService = require('../services/jobAggregationService');
const { getJobDetails } = require('../services/jobDetailService');
const AppliedJob = require('../models/AppliedJob');

// controllers/jobController.js
const searchJobs = async (req, res) => {
  try {
    const requestSource = req.method === 'POST' ? req.body : req.query;
    console.log('Request params:', requestSource);
    
    // Extract query parameters from request
    const {
      role = 'software engineer',
      location = 'New York',
      page = '1',
      resumeProfile = null,
      jobType = 'full-time',
    } = requestSource;
    
    console.log(`Searching for ${role} in ${location}, page ${page}, type ${jobType}`);
    
    // Try to get job data
    let jobData;
    try {
      jobData = await jobAggregationService.getAggregatedJobs(
        role, 
        location, 
        parseInt(page),
        resumeProfile,
        jobType
      );

      if (req.user && Array.isArray(jobData.jobs) && jobData.jobs.length > 0) {
        const appliedJobs = await AppliedJob.find({ user: req.user._id })
          .select('jobId url')
          .lean();
        const appliedJobIds = new Set(appliedJobs.map((job) => job.jobId));
        const appliedJobUrls = new Set(appliedJobs.map((job) => job.url));

        jobData = {
          ...jobData,
          jobs: jobData.jobs.map((job) => ({
            ...job,
            isApplied: appliedJobIds.has(job.id) || appliedJobUrls.has(job.url),
          })),
        };
      }
    } catch (error) {
      console.error('Error from job aggregation service:', error);
      // Provide fallback data if the service fails
      jobData = {
        jobs: [],
        count: 0,
        totalPages: 1,
        currentPage: parseInt(page)
      };
    }
    
    // Return response
    res.json(jobData);
  } catch (error) {
    console.error('Unhandled error in job controller:', error);
    
    // Send a proper error response
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while searching for jobs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const listAppliedJobs = async (req, res) => {
  try {
    const jobs = await AppliedJob.find({ user: req.user._id })
      .sort({ appliedAt: -1, createdAt: -1 })
      .lean();

    return res.json({
      jobs: jobs.map((job) => ({
        id: job._id.toString(),
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        url: job.url,
        source: job.source,
        appliedAt: job.appliedAt,
        isApplied: true,
      })),
    });
  } catch (error) {
    console.error('Error loading applied jobs:', error);
    return res.status(500).json({
      error: 'Failed to load applied jobs.',
      message: 'An unexpected error occurred while loading application history.',
    });
  }
};

const saveAppliedJob = async (req, res) => {
  try {
    const job = req.body;

    if (!job?.id || !job?.title || !job?.company || !job?.url) {
      return res.status(400).json({
        error: 'Missing job data',
        message: 'Job id, title, company, and url are required.',
      });
    }

    const savedJob = await AppliedJob.findOneAndUpdate(
      { user: req.user._id, jobId: job.id },
      {
        user: req.user._id,
        jobId: job.id,
        title: job.title,
        company: job.company,
        location: job.location || '',
        description: job.description || '',
        url: job.url,
        source: job.source || 'Unknown',
        appliedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      message: 'Job saved to your applied history.',
      job: {
        id: savedJob._id.toString(),
        jobId: savedJob.jobId,
        title: savedJob.title,
        company: savedJob.company,
        location: savedJob.location,
        description: savedJob.description,
        url: savedJob.url,
        source: savedJob.source,
        appliedAt: savedJob.appliedAt,
        isApplied: true,
      },
    });
  } catch (error) {
    console.error('Error saving applied job:', error);
    return res.status(500).json({
      error: 'Failed to save applied job.',
      message: 'An unexpected error occurred while saving application history.',
    });
  }
};

const fetchJobDetails = async (req, res) => {
  try {
    const job = req.body;

    if (!job?.url) {
      return res.status(400).json({
        error: 'Job URL is required to fetch details.',
      });
    }

    const details = await getJobDetails(job);
    return res.json(details);
  } catch (error) {
    console.error('Error fetching job details:', error);
    return res.status(500).json({
      error: 'Failed to load job details.',
      message: error.message,
    });
  }
};

module.exports = {
  searchJobs,
  fetchJobDetails,
  listAppliedJobs,
  saveAppliedJob,
};
