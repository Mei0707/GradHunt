const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const { requireAuth, requireVerifiedEmail } = require('../middleware/authMiddleware');

router.post('/upload', resumeController.uploadResume);
router.post('/analyze', resumeController.analyzeResume);
router.get('/history', requireAuth, requireVerifiedEmail, resumeController.listSavedResumes);
router.post('/save', requireAuth, requireVerifiedEmail, resumeController.saveResumeToHistory);

module.exports = router;
