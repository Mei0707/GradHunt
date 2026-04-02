const fs = require('fs');
const path = require('path');
const { analyzeStoredResume } = require('../services/resumeAnalysisService');

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
    const { storedFileName } = req.body;

    if (!storedFileName) {
      return res.status(400).json({
        error: 'Missing storedFileName',
        message: 'storedFileName is required to analyze an uploaded resume.',
      });
    }

    const result = await analyzeStoredResume(storedFileName);
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

module.exports = {
  uploadResume,
  analyzeResume,
};
