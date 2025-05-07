// backend/server.js
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');
const jobRoutes = require('./routes/jobRoutes');

// Load environment variables
dotenv.config();

// Connect to database (still useful for caching scraped jobs)
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
app.use('/api/jobs', jobRoutes);

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