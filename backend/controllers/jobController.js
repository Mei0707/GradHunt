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
    if (results_per_page) params.results_per_page = parseInt(results_per_page);
    if (page) params.page = parseInt(page);
    
    console.log('Sending parameters to adzunaService:', params);
    
    // Call the service to search jobs
    const jobsData = await adzunaService.searchJobs(params);
    
    // console.log('Response from Adzuna:', JSON.stringify(jobsData).slice(0, 200) + '...');
    
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
    
    // Return response
    res.json({
      jobs: formattedJobs,
      count: jobsData.count,
      mean: jobsData.mean,
      totalResults: jobsData.count
    });
  } catch (error) {
    console.error('Error in job search controller:', error);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      return res.status(error.response.status).json({
        error: 'Error from Adzuna API',
        details: error.response.data,
        status: error.response.status
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up request:', error.message);
      
      return res.status(500).json({
        error: 'Error setting up request to Adzuna API',
        details: error.message
      });
    }
  }
};

//get details for specific job
const getJobById = async (req, res) => {
    try {
        const { id } = req.params;
        const jobData = await adzunaService.getJobById(id);

        //format job data
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