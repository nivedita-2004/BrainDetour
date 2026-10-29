const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} = require('../utils/tokens');
const { sendPasswordResetEmail } = require('../utils/mailer');

/**
 * POST /api/auth/signup
 */
async function signup(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    // Generate tokens and store refresh token hash
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshTokenHash = hashToken(refreshToken);

    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: user.toSafeObject(),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }
    next(error);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Issue tokens and save rotated refresh token hash
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      user: user.toSafeObject(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/refresh
 */
async function refresh(req, res, next) {
  try {
    const incomingToken = req.cookies?.refreshToken;

    if (!incomingToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(incomingToken);
    } catch (_err) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
    }

    if (decoded.tokenType !== 'refresh') {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
      });
    }

    const incomingHash = hashToken(incomingToken);
    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    const newRefreshHash = hashToken(newRefreshToken);

    // Atomically find user matching the exact incoming hash and rotate to new hash
    const updatedUser = await User.findOneAndUpdate(
      { _id: decoded.userId, refreshTokenHash: incomingHash },
      { refreshTokenHash: newRefreshHash },
      { returnDocument: 'after' }
    );

    // If update failed, token was either already rotated (reuse attempt) or revoked
    if (!updatedUser) {
      // Invalidate existing sessions as safeguard against token theft
      await User.findByIdAndUpdate(decoded.userId, { refreshTokenHash: null });
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token has already been used or invalidated. Please log in again.',
      });
    }

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      user: updatedUser.toSafeObject(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res, next) {
  try {
    const incomingToken = req.cookies?.refreshToken;
    if (incomingToken) {
      try {
        const decoded = verifyRefreshToken(incomingToken);
        await User.findByIdAndUpdate(decoded.userId, { refreshTokenHash: null });
      } catch (_err) {
        // Silently proceed if token is already expired
      }
    }

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 */
async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user.toSafeObject(),
  });
}

/**
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    const genericSuccessResponse = {
      success: true,
      message: 'If an account exists with this email, a reset verification code has been sent.',
    };

    // Return generic message if user doesn't exist to prevent account enumeration
    if (!user) {
      return res.status(200).json(genericSuccessResponse);
    }

    // Cooldown check: 60 seconds between OTP requests
    if (user.passwordResetLastSentAt) {
      const timeSinceLastSent = Date.now() - new Date(user.passwordResetLastSentAt).getTime();
      if (timeSinceLastSent < 60 * 1000) {
        return res.status(429).json({
          success: false,
          message: 'Please wait 60 seconds before requesting another verification code.',
        });
      }
    }

    // Generate random 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    user.passwordResetOtpHash = otpHash;
    user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.passwordResetAttempts = 0;
    user.passwordResetLastSentAt = new Date();
    await user.save();

    try {
      await sendPasswordResetEmail(user.email, otp);
    } catch (mailError) {
      // Clear OTP state on email delivery failure
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
      });
    }

    return res.status(200).json(genericSuccessResponse);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, verification code, and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be a 6-digit number',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code',
      });
    }

    // Check expiration
    if (Date.now() > new Date(user.passwordResetOtpExpiresAt).getTime()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new one.',
      });
    }

    // Check maximum attempts (limit to 5 incorrect attempts)
    if (user.passwordResetAttempts >= 5) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new verification code.',
      });
    }

    // Compare hash of provided OTP
    const inputHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (inputHash !== user.passwordResetOtpHash) {
      user.passwordResetAttempts += 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid verification code',
      });
    }

    // Hash new password and clear reset state
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.passwordResetAttempts = 0;
    user.passwordResetLastSentAt = null;
    user.refreshTokenHash = null; // Invalidate all active refresh sessions
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. Please log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signup,
  login,
  refresh,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
};
