// backend/services/adzunaService.js
const axios = require('axios');

// Base URL for Adzuna API
const BASE_URL = 'https://api.adzuna.com/v1/api';

/**
 * Search for jobs based on keywords, location and other parameters
 * @param {Object} params - Search parameters
 * @returns {Promise} - Promise resolving to job search results
 */
const searchJobs = async (params = {}) => {
  try {
    // Get these from Adzuna Developer Portal after registration
    const APP_ID = process.env.ADZUNA_APP_ID;
    const APP_KEY = process.env.ADZUNA_APP_KEY;

    console.log('Adzuna API credentials:', { 
      APP_ID: APP_ID ? 'Set' : 'Not set', 
      APP_KEY: APP_KEY ? 'Set' : 'Not set'
    });
    
    if (!APP_ID || !APP_KEY) {
      throw new Error('Adzuna API credentials not set. Please check your .env file.');
    }
    
    // Default parameters for tech internships/entry-level jobs
    const defaultParams = {
      what: 'software engineer intern OR entry level developer OR graduate developer',
      where: '',
      distance: 25,
      max_days_old: 30,
      sort_by: 'date',
      results_per_page: 20,
      page: 1,
      country: 'us', // Country code
    };

    // Merge default parameters with provided parameters
    const searchParams = { ...defaultParams, ...params };
    
    console.log('Final search parameters:', searchParams);
    
    // Construct URL with country code and page
    const url = `${BASE_URL}/jobs/${searchParams.country}/search/${searchParams.page}`;
    console.log('Request URL:', url);
    
    const what = searchParams.what;
    const enhancedWhat = what.toLowerCase().includes('software')
      ?  `${what} developer OR engineer OR programmer NOT hair NOT stylist NOT retail`
      : what;
    // Prepare request parameters
    const requestParams = {
      app_id: APP_ID,
      app_key: APP_KEY,
      results_per_page: searchParams.results_per_page,
      what: searchParams.what,
      where: searchParams.where,
      distance: searchParams.distance,
      max_days_old: searchParams.max_days_old,
      sort_by: searchParams.sort_by,
      'content-type': 'application/json',
    };
    
    console.log('Request parameters:', requestParams);
    
    // Make request
    console.log('Sending request to Adzuna API...');
    const response = await axios.get(url, {
      params: requestParams,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('Response status:', response.status);
    
    return response.data;
  } catch (error) {
    console.error('Error in adzunaService:', error);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    throw error;
  }
};


//get job details by job id
const getJobById = async (jobId, country = 'us') => {
    try {
        const url = `${BASE_URL}/jobs/${country}/${jobId}`;

        const response = await axios.get(url, {
            params: {
                app_id: APP_ID,
                app_key: APP_KEY,
                content_type: 'application/json',
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error fetching job details:', error.response?.data || error.message);
        throw error;
    }
};

module.exports = {
    searchJobs,
    getJobById
};
