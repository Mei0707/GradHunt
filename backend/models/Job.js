// backend/models/Job.js
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  applyLink: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    required: true, // 'LinkedIn', 'Indeed', etc.
  },
  jobType: {
    type: String,
    enum: ['Internship', 'Entry Level', 'Mid Level', 'Senior'],
    required: true,
  },
  datePosted: {
    type: Date,
    default: Date.now,
  },
  skills: [String],
  isRemote: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model('Job', jobSchema);