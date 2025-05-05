// backend/server.js

const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors');
const jobRoutes = require('./routes/jobRoutes');

dotenv.config();

connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

//middleware
app.use(cors());
app.use(express.json());

// Basic route to check if the server is working
app.get('/', (req, res) => {
    res.send('GradHunt Backend is running');
});

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - Request: ${req.method} ${req.url}`);
    next();
  });

//Job routes
app.use('/api/jobs', jobRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
