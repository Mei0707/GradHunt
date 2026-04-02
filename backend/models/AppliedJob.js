const mongoose = require('mongoose');

const appliedJobSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      default: 'Unknown',
      trim: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

appliedJobSchema.index({ user: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('AppliedJob', appliedJobSchema);
