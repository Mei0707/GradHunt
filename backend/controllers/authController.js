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

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password must be at least 8 characters long.',
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

module.exports = {
  register,
  login,
  me,
};
