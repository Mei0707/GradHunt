const mongoose = require('mongoose');
const User = require('../models/User');
const { verifyToken } = require('../services/authService');

const requireDatabaseConnection = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      error: 'Database unavailable',
      message: 'Authentication features require MongoDB to be connected.',
    });
    return false;
  }

  return true;
};

const requireAuth = async (req, res, next) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to continue.',
      });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.userId).select('_id name email isEmailVerified passwordHash createdAt');

    if (!user) {
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Your account could not be found. Please log in again.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid session',
      message: error.message || 'Please log in again.',
    });
  }
};

const optionalAuth = async (req, res, next) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return next();
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.userId).select('_id name email isEmailVerified createdAt');

    if (user) {
      req.user = user;
    }
  } catch (error) {
    // Ignore optional auth failures and continue anonymously.
  }

  next();
};

const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to continue.',
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email address to use saved history and application tracking features.',
    });
  }

  return next();
};

module.exports = {
  requireAuth,
  requireDatabaseConnection,
  optionalAuth,
  requireVerifiedEmail,
};
