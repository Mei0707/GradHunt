// backend/services/adzunaService.js
const axios = require('axios');
require('dotenv').config();

// Get these from Adzuna Developer Portal after registration
const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;

// Base URL for Adzuna API
const BASE_URL = 'https://api.adzuna.com/v1/api';

/**
 * Search for jobs based on keywords, location and other parameters
 * @param {Object} params - Search parameters
 * @returns {Promise} - Promise resolving to job search results
 */
const searchJobs = async (params = {}) => {
  try {
    // Verify credentials are available
    if (!APP_ID || !APP_KEY) {
      console.error('API credentials missing');
      throw new Error('Adzuna API credentials not set. Please check your .env file.');
    }
    
    // Default parameters for tech internships/entry-level jobs
    const defaultParams = {
      what: 'software engineer intern OR entry level developer OR graduate developer',
      where: '',
      distance: 25,
      max_days_old: 30,
      sort_by: 'date',
      results_per_page: 25,
      page: 1,
      country: 'us',
    };

    // Merge default parameters with provided parameters
    const searchParams = { ...defaultParams, ...params };
    
    console.log('Search params:', JSON.stringify(searchParams));
    
    // Construct URL with country code and page
    const url = `${BASE_URL}/jobs/${searchParams.country}/search/${searchParams.page}`;
    
    // Make request
    const response = await axios.get(url, {
      params: {
        app_id: APP_ID,
        app_key: APP_KEY,
        results_per_page: searchParams.results_per_page,
        what: searchParams.what,
        where: searchParams.where,
        distance: searchParams.distance,
        max_days_old: searchParams.max_days_old,
        sort_by: searchParams.sort_by,
        'content-type': 'application/json',
      },
      headers: {
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error in adzunaService:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', JSON.stringify(error.response.data));
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
};

/**
 * Get job details by job ID
 * @param {string} jobId - Adzuna job ID
 * @returns {Promise} - Promise resolving to job details
 */
const getJobById = async (jobId, country = 'us') => {
  try {
    if (!APP_ID || !APP_KEY) {
      throw new Error('Adzuna API credentials not set. Please check your .env file.');
    }

    const url = `${BASE_URL}/jobs/${country}/${jobId}`;

    const response = await axios.get(url, {
      params: {
        app_id: APP_ID,
        app_key: APP_KEY,
        'content-type': 'application/json',
      },
      headers: {
        'Accept': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching job details:', error);
    throw error;
  }
};

module.exports = {
  searchJobs,
  getJobById
};