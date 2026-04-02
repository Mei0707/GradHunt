// backend/server.js
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');
const jobRoutes = require('./routes/jobRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const authRoutes = require('./routes/authRoutes');

// Load environment variables
dotenv.config();

// Connect to database (still useful for caching scraped jobs)
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Increase request timeout for web scraping
app.use((req, res, next) => {
  // Set timeout to 2 minutes for scraping operations
  req.setTimeout(120000);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - Request: ${req.method} ${req.url}`);
  next();
});

// Ensure body parsing and other server errors come back as JSON instead of HTML
app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  console.error('Server middleware error:', error);

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload too large',
      message: 'The uploaded resume is too large for the server to process. Please upload a smaller file.',
    });
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      error: 'Invalid JSON payload',
      message: 'The request body could not be parsed. Please try uploading the resume again.',
    });
  }

  return res.status(500).json({
    error: 'Server error',
    message: 'An unexpected server error occurred.',
  });
});

// Basic route to check if the server is working
app.get('/', (req, res) => {
  res.send('GradHunt Backend is running with web scraping for job data');
});

// Test route to check scraper status
app.get('/api/scraper-status', (req, res) => {
  res.json({
    status: 'active',
    scrapers: [
      'Google Careers', 
      'Microsoft Careers',
      'Amazon Jobs'
      // Add more as you implement them
    ],
    lastUpdated: new Date().toISOString()
  });
});

// Job routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/resume', resumeRoutes);

// Serve frontend from backend if in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend', 'index.html'));
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Using web scraping for job data collection`);
});
