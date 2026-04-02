// backend/routes/jobRoutes.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { optionalAuth, requireAuth } = require('../middleware/authMiddleware');

// Log when routes are loaded
console.log('Loading job routes...');

// Make sure these routes use actual functions from your controller
router.get('/search', optionalAuth, jobController.searchJobs);
router.post('/search', optionalAuth, jobController.searchJobs);
router.post('/details', jobController.fetchJobDetails);
router.get('/applied', requireAuth, jobController.listAppliedJobs);
router.post('/applied', requireAuth, jobController.saveAppliedJob);

// If you have a getJobById route, make sure it's properly defined
// router.get('/:id', jobController.getJobById);

console.log('Job routes loaded successfully');

module.exports = router;
