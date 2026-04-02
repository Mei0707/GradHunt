const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/upload', resumeController.uploadResume);
router.post('/analyze', resumeController.analyzeResume);
router.get('/history', requireAuth, resumeController.listSavedResumes);
router.post('/save', requireAuth, resumeController.saveResumeToHistory);

module.exports = router;
