const User = require('../models/User');
const AuthToken = require('../models/AuthToken');
const {
  hashPassword,
  verifyPassword,
  createToken,
  createOpaqueToken,
  hashOpaqueToken,
} = require('../services/authService');
const { deliverAuthEmail } = require('../services/authEmailService');
const { requireDatabaseConnection } = require('../middleware/authMiddleware');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const serializeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  isEmailVerified: Boolean(user.isEmailVerified),
  createdAt: user.createdAt,
});

const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  return null;
};

const issueAuthActionToken = async (userId, type, ttlMs) => {
  const rawToken = createOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);

  await AuthToken.deleteMany({ user: userId, type });
  await AuthToken.create({
    user: userId,
    type,
    tokenHash,
    expiresAt: new Date(Date.now() + ttlMs),
  });

  return rawToken;
};

const attachDevLinkIfAvailable = (payload, deliveryResult) => {
  if (process.env.NODE_ENV === 'production' || !deliveryResult?.previewLink) {
    return payload;
  }

  return {
    ...payload,
    devPreviewLink: deliveryResult.previewLink,
  };
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
      isEmailVerified: false,
    });

    let deliveryResult = null;
    let verificationMessage = 'Please verify your email address to secure your account features.';

    try {
      const verificationToken = await issueAuthActionToken(
        user._id,
        'email-verification',
        EMAIL_VERIFICATION_TTL_MS
      );
      deliveryResult = await deliverAuthEmail({
        type: 'email-verification',
        user,
        token: verificationToken,
      });
    } catch (emailError) {
      console.error('Verification email send failed during registration:', emailError);
      verificationMessage = 'Account created successfully. We could not send the verification email right now, but you can request another one from Profile > Settings.';
    }
    const token = createToken({ userId: user._id.toString() });

    return res.status(201).json(attachDevLinkIfAvailable({
      message: 'Account created successfully.',
      verificationMessage,
      token,
      user: serializeUser(user),
    }, deliveryResult));
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
    const emailChanged = req.user.email !== normalizedEmail;
    req.user.email = normalizedEmail;
    if (emailChanged) {
      req.user.isEmailVerified = false;
    }
    await req.user.save();

    let deliveryResult = null;
    let responseMessage = emailChanged
      ? 'Profile updated. Please verify your new email address.'
      : 'Profile updated successfully.';
    if (emailChanged) {
      try {
        const verificationToken = await issueAuthActionToken(
          req.user._id,
          'email-verification',
          EMAIL_VERIFICATION_TTL_MS
        );
        deliveryResult = await deliverAuthEmail({
          type: 'email-verification',
          user: req.user,
          token: verificationToken,
        });
      } catch (emailError) {
        console.error('Verification email send failed after profile update:', emailError);
        responseMessage = 'Profile updated, but we could not send a verification email right now. You can request another one from Profile > Settings.';
      }
    }

    return res.json(attachDevLinkIfAvailable({
      message: responseMessage,
      user: serializeUser(req.user),
    }, deliveryResult));
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

const requestEmailVerification = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    if (req.user.isEmailVerified) {
      return res.json({
        message: 'Your email is already verified.',
      });
    }

    const verificationToken = await issueAuthActionToken(
      req.user._id,
      'email-verification',
      EMAIL_VERIFICATION_TTL_MS
    );
    const deliveryResult = await deliverAuthEmail({
      type: 'email-verification',
      user: req.user,
      token: verificationToken,
    });

    return res.json(attachDevLinkIfAvailable({
      message: 'Verification email sent.',
    }, deliveryResult));
  } catch (error) {
    console.error('Error sending verification email:', error);
    return res.status(500).json({
      error: 'Failed to send verification email',
      message: 'An unexpected error occurred while sending the verification email.',
    });
  }
};

const verifyEmail = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const { token = '' } = req.body;
    if (!token) {
      return res.status(400).json({
        error: 'Missing token',
        message: 'Verification token is required.',
      });
    }

    const tokenRecord = await AuthToken.findOne({
      tokenHash: hashOpaqueToken(token),
      type: 'email-verification',
      expiresAt: { $gt: new Date() },
    });

    if (!tokenRecord) {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'This verification link is invalid or has expired.',
      });
    }

    const user = await User.findById(tokenRecord.user);
    if (!user) {
      await tokenRecord.deleteOne();
      return res.status(404).json({
        error: 'User not found',
        message: 'The account for this verification link no longer exists.',
      });
    }

    user.isEmailVerified = true;
    await user.save();
    await AuthToken.deleteMany({ user: user._id, type: 'email-verification' });

    return res.json({
      message: 'Your email has been verified successfully.',
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({
      error: 'Failed to verify email',
      message: 'An unexpected error occurred while verifying your email.',
    });
  }
};

const forgotPassword = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const { email = '' } = req.body;
    if (!email.trim()) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'Email is required.',
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.json({
        message: 'If an account exists for that email, a reset link has been sent.',
      });
    }

    const resetToken = await issueAuthActionToken(
      user._id,
      'password-reset',
      PASSWORD_RESET_TTL_MS
    );
    const deliveryResult = await deliverAuthEmail({
      type: 'password-reset',
      user,
      token: resetToken,
    });

    return res.json(attachDevLinkIfAvailable({
      message: 'If an account exists for that email, a reset link has been sent.',
    }, deliveryResult));
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return res.status(500).json({
      error: 'Failed to reset password',
      message: 'An unexpected error occurred while requesting a password reset.',
    });
  }
};

const resetPassword = async (req, res) => {
  if (!requireDatabaseConnection(res)) {
    return;
  }

  try {
    const { token = '', newPassword = '', confirmPassword = '' } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Reset token, new password, and confirmation are required.',
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

    const tokenRecord = await AuthToken.findOne({
      tokenHash: hashOpaqueToken(token),
      type: 'password-reset',
      expiresAt: { $gt: new Date() },
    });

    if (!tokenRecord) {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'This reset link is invalid or has expired.',
      });
    }

    const user = await User.findById(tokenRecord.user);
    if (!user) {
      await tokenRecord.deleteOne();
      return res.status(404).json({
        error: 'User not found',
        message: 'The account for this reset link no longer exists.',
      });
    }

    user.passwordHash = hashPassword(newPassword);
    await user.save();
    await AuthToken.deleteMany({ user: user._id, type: 'password-reset' });

    return res.json({
      message: 'Your password has been reset successfully. You can log in now.',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({
      error: 'Failed to reset password',
      message: 'An unexpected error occurred while resetting your password.',
    });
  }
};

module.exports = {
  register,
  login,
  me,
  updateProfile,
  changePassword,
  requestEmailVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
