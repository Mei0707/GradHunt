// backend/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// Log when routes are loaded
console.log('Loading job routes...');

// Make sure these routes use actual functions from your controller
router.get('/search', jobController.searchJobs);

// If you have a getJobById route, make sure it's properly defined
// router.get('/:id', jobController.getJobById);

console.log('Job routes loaded successfully');

module.exports = router;