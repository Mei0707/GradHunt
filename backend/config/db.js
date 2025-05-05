// backend/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MongoDB URI is defined
    if (!process.env.MONGODB_URI) {
      console.log('MongoDB URI not found. Running in API-only mode without database connection.');
      return;
    }
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.log('Running in API-only mode without database connection.');
  }
};

module.exports = connectDB;