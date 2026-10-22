// backend/config/db.js
const mongoose = require('mongoose');
const { log } = require('../lib/telemetry');
mongoose.set('bufferCommands', false);

const connectDB = async () => {
  try {
    // Check if MongoDB URI is defined
    if (!process.env.MONGODB_URI) {
      console.log('MongoDB URI not found. Running in API-only mode without database connection.');
      return;
    }
    
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    log('info', 'database_connected');
  } catch (error) {
    log('error', 'database_connection_failed', { type: error.name });
    if (process.env.NODE_ENV === 'production') throw error;
    console.log('Running in API-only mode without database connection.');
  }
};

module.exports = connectDB;
