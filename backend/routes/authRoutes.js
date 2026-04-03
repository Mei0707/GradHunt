const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { createRateLimit } = require('../middleware/rateLimitMiddleware');

const router = express.Router();
const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 8,
  scope: 'auth-login',
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});
const registerRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  scope: 'auth-register',
  message: 'Too many account creation attempts. Please try again later.',
});
const emailActionRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  scope: 'auth-email-actions',
  message: 'Too many email requests. Please wait a few minutes before trying again.',
});

router.post('/register', registerRateLimit, authController.register);
router.post('/login', loginRateLimit, authController.login);
router.post('/forgot-password', emailActionRateLimit, authController.forgotPassword);
router.post('/reset-password', emailActionRateLimit, authController.resetPassword);
router.post('/verify-email', emailActionRateLimit, authController.verifyEmail);
router.get('/me', requireAuth, authController.me);
router.patch('/profile', requireAuth, authController.updateProfile);
router.post('/change-password', requireAuth, emailActionRateLimit, authController.changePassword);
router.post('/request-verification', requireAuth, emailActionRateLimit, authController.requestEmailVerification);

module.exports = router;
