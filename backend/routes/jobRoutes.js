// backend/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// Log when routes are loaded
console.log('Loading job routes...');

// Search jobs
router.get('/search', jobController.searchJobs);

// Get job by ID
router.get('/:id', jobController.getJobById);

console.log('Job routes loaded successfully');

module.exports = router;