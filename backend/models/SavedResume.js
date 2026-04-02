const mongoose = require('mongoose');

const savedResumeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    storedFileName: {
      type: String,
      default: null,
      trim: true,
    },
    mimeType: {
      type: String,
      default: 'application/octet-stream',
    },
    size: {
      type: Number,
      default: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    analysis: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    extractedTextPreview: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

savedResumeSchema.index({ user: 1, storedFileName: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SavedResume', savedResumeSchema);
