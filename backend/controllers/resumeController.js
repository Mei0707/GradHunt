const { log } = require('../lib/telemetry');
const { randomUUID } = require('node:crypto');
const { writeResume } = require('../services/resumeStorage');
const path = require('path');
const { analyzeResumeInput, extractResumeText } = require('../services/resumeAnalysisService');
const { optimizeResume: optimizeResumeViaAgent } = require('../services/agentServiceClient');
const SavedResume = require('../models/SavedResume');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt']);
const buildSafeFilename = originalName => `${randomUUID()}${path.extname(originalName).toLowerCase()}`;

const uploadResume = async (req, res) => {
  try {
    const { fileName, mimeType, fileData } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({
        error: 'Missing file data',
        message: 'Both fileName and fileData are required.',
      });
    }

    const extension = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Please upload a PDF, DOC, DOCX, or TXT resume.',
      });
    }

    const buffer = Buffer.from(fileData, 'base64');
    if (!buffer.length) {
      return res.status(400).json({
        error: 'Invalid file content',
        message: 'The uploaded file appears to be empty.',
      });
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        error: 'File too large',
        message: 'Please upload a file smaller than 5 MB.',
      });
    }

    const storedFileName = buildSafeFilename(fileName);
    await writeResume(storedFileName, buffer);

    res.status(201).json({
      message: 'Resume uploaded successfully.',
      resume: {
        originalName: fileName,
        storedFileName,
        mimeType: mimeType || 'application/octet-stream',
        size: buffer.length,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log('error', 'controller_failure', { operation: 'Error uploading resume:', type: error.name });
    res.status(500).json({
      error: 'Failed to upload resume',
      message: 'An unexpected error occurred while uploading the resume.',
    });
  }
};

const analyzeResume = async (req, res) => {
  try {
    const { storedFileName, resumeText } = req.body;

    if (!storedFileName && !resumeText) {
      return res.status(400).json({
        error: 'Missing resume input',
        message: 'Provide either storedFileName or resumeText to analyze a resume.',
      });
    }

    const result = await analyzeResumeInput({ storedFileName, resumeText });
    res.json({
      message: 'Resume analyzed successfully.',
      ...result,
    });
  } catch (error) {
    log('error', 'controller_failure', { operation: 'Error analyzing resume:', type: error.name });
    const statusCode = error.message.includes('OPENAI_API_KEY') ? 503 : 500;

    res.status(statusCode).json({
      error: 'Failed to analyze resume',
      message: error.message || 'An unexpected error occurred while analyzing the resume.',
    });
  }
};

// Delegates to the Python agent service (Resume Optimization Agent). Node
// resolves the resume text (from an uploaded file or pasted text) and the
// authenticated user id, then hands off the multi-agent reasoning.
const optimizeResume = async (req, res) => {
  try {
    const { storedFileName, resumeText, jobDescription, jobTitle, company } = req.body;

    if (!jobDescription || jobDescription.trim().length < 40) {
      return res.status(400).json({
        error: 'Missing job description',
        message: 'A job description (at least 40 characters) is required to optimize the resume.',
      });
    }

    let finalResumeText = (resumeText || '').trim();
    if (!finalResumeText && storedFileName) {
      finalResumeText = await extractResumeText(storedFileName);
    }

    if (!finalResumeText || finalResumeText.length < 80) {
      return res.status(400).json({
        error: 'Missing resume input',
        message: 'Provide resumeText or a valid storedFileName with extractable resume content.',
      });
    }

    const result = await optimizeResumeViaAgent({
      userId: req.user._id.toString(),
      resumeText: finalResumeText,
      jobDescription,
      jobTitle,
      company,
    });

    res.json({
      message: 'Resume optimized successfully.',
      optimization: result,
    });
  } catch (error) {
    log('error', 'controller_failure', { operation: 'Error optimizing resume:', type: error.name });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: 'Failed to optimize resume',
      message: error.message || 'An unexpected error occurred while optimizing the resume.',
    });
  }
};

const listSavedResumes = async (req, res) => {
  try {
    const savedResumes = await SavedResume.find({ user: req.user._id })
      .sort({ uploadedAt: -1, createdAt: -1 })
      .lean();

    res.json({
      resumes: savedResumes.map((resume) => ({
        id: resume._id.toString(),
        originalName: resume.originalName,
        storedFileName: resume.storedFileName,
        mimeType: resume.mimeType,
        size: resume.size,
        uploadedAt: resume.uploadedAt,
        analysis: resume.analysis,
        extractedTextPreview: resume.extractedTextPreview,
      })),
    });
  } catch (error) {
    log('error', 'controller_failure', { operation: 'Error fetching saved resumes:', type: error.name });
    res.status(500).json({
      error: 'Failed to load saved resumes',
      message: 'An unexpected error occurred while loading resume history.',
    });
  }
};

const saveResumeToHistory = async (req, res) => {
  try {
    const {
      originalName,
      storedFileName = null,
      mimeType = 'application/octet-stream',
      size = 0,
      uploadedAt,
      analysis,
      extractedTextPreview = '',
    } = req.body;

    if (!originalName || !analysis) {
      return res.status(400).json({
        error: 'Missing resume data',
        message: 'originalName and analysis are required to save resume history.',
      });
    }

    let savedResume;

    if (storedFileName) {
      savedResume = await SavedResume.findOneAndUpdate(
        { user: req.user._id, storedFileName },
        {
          user: req.user._id,
          originalName,
          storedFileName,
          mimeType,
          size,
          uploadedAt: uploadedAt ? new Date(uploadedAt) : new Date(),
          analysis,
          extractedTextPreview,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      savedResume = await SavedResume.create({
        user: req.user._id,
        originalName,
        storedFileName: null,
        mimeType,
        size,
        uploadedAt: uploadedAt ? new Date(uploadedAt) : new Date(),
        analysis,
        extractedTextPreview,
      });
    }

    res.status(201).json({
      message: 'Resume saved to your history.',
      resume: {
        id: savedResume._id.toString(),
        originalName: savedResume.originalName,
        storedFileName: savedResume.storedFileName,
        mimeType: savedResume.mimeType,
        size: savedResume.size,
        uploadedAt: savedResume.uploadedAt,
        analysis: savedResume.analysis,
        extractedTextPreview: savedResume.extractedTextPreview,
      },
    });
  } catch (error) {
    log('error', 'controller_failure', { operation: 'Error saving resume history:', type: error.name });
    res.status(500).json({
      error: 'Failed to save resume history',
      message: 'An unexpected error occurred while saving the resume.',
    });
  }
};

module.exports = {
  uploadResume,
  analyzeResume,
  optimizeResume,
  listSavedResumes,
  saveResumeToHistory,
};
