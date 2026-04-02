const User = require('../models/User');
const { hashPassword, verifyPassword, createToken } = require('../services/authService');
const { requireDatabaseConnection } = require('../middleware/authMiddleware');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const serializeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
});

const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  return null;
};

const register = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const { name = '', email = '', password = '' } = req.body;

    if (!name.trim() || !email.trim() || !password) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Name, email, and password are required.',
      });
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      return res.status(400).json({
        error: 'Invalid email',
        message: 'Please enter a valid email address.',
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        error: 'Weak password',
        message: passwordError,
      });
    }

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: 'Account exists',
        message: 'An account with that email already exists.',
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
    });

    const token = createToken({ userId: user._id.toString() });

    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({
      error: 'Failed to register',
      message: 'An unexpected error occurred while creating the account.',
    });
  }
};

const login = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const { email = '', password = '' } = req.body;

    if (!email.trim() || !password) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect.',
      });
    }

    const token = createToken({ userId: user._id.toString() });

    return res.json({
      message: 'Logged in successfully.',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({
      error: 'Failed to log in',
      message: 'An unexpected error occurred while logging in.',
    });
  }
};

const me = async (req, res) => {
  return res.json({
    user: serializeUser(req.user),
  });
};

const updateProfile = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const { name = '', email = '' } = req.body;

    if (!name.trim() || !email.trim()) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Name and email are required.',
      });
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      return res.status(400).json({
        error: 'Invalid email',
        message: 'Please enter a valid email address.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user._id },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Email in use',
        message: 'Another account already uses that email address.',
      });
    }

    req.user.name = name.trim();
    req.user.email = normalizedEmail;
    await req.user.save();

    return res.json({
      message: 'Profile updated successfully.',
      user: serializeUser(req.user),
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({
      error: 'Failed to update profile',
      message: 'An unexpected error occurred while updating your profile.',
    });
  }
};

const changePassword = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const {
      currentPassword = '',
      newPassword = '',
      confirmPassword = '',
    } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Current password, new password, and confirmation are required.',
      });
    }

    if (!verifyPassword(currentPassword, req.user.passwordHash)) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Your current password is incorrect.',
      });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({
        error: 'Weak password',
        message: passwordError,
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: 'Password mismatch',
        message: 'New password and confirmation must match.',
      });
    }

    if (verifyPassword(newPassword, req.user.passwordHash)) {
      return res.status(400).json({
        error: 'Password unchanged',
        message: 'Choose a new password that is different from your current password.',
      });
    }

    req.user.passwordHash = hashPassword(newPassword);
    await req.user.save();

    return res.json({
      message: 'Password updated successfully.',
    });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({
      error: 'Failed to change password',
      message: 'An unexpected error occurred while changing your password.',
    });
  }
};

module.exports = {
  register,
  login,
  me,
  updateProfile,
  changePassword,
};
