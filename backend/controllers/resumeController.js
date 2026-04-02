const fs = require('fs');
const path = require('path');
const { analyzeResumeInput } = require('../services/resumeAnalysisService');
const SavedResume = require('../models/SavedResume');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt']);
const uploadsDir = path.join(__dirname, '../uploads/resumes');

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

const buildSafeFilename = (originalName) => {
  const extension = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, extension).replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-');
  return `${Date.now()}-${baseName || 'resume'}${extension}`;
};

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

    ensureUploadsDir();

    const storedFileName = buildSafeFilename(fileName);
    const filePath = path.join(uploadsDir, storedFileName);
    fs.writeFileSync(filePath, buffer);

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
    console.error('Error uploading resume:', error);
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
    console.error('Error analyzing resume:', error);
    const statusCode = error.message.includes('OPENAI_API_KEY') ? 503 : 500;

    res.status(statusCode).json({
      error: 'Failed to analyze resume',
      message: error.message || 'An unexpected error occurred while analyzing the resume.',
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
    console.error('Error fetching saved resumes:', error);
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
    console.error('Error saving resume history:', error);
    res.status(500).json({
      error: 'Failed to save resume history',
      message: 'An unexpected error occurred while saving the resume.',
    });
  }
};

module.exports = {
  uploadResume,
  analyzeResume,
  listSavedResumes,
  saveResumeToHistory,
};
