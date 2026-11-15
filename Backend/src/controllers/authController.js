const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
  generatePasswordResetToken,
  hashToken,
  verifyRefreshToken,
  verifyPasswordResetToken,
  setAuthCookies,
  clearAuthCookies,
  PASSWORD_RESET_TOKEN_MAX_AGE,
} = require('../utils/tokens');
const mailer = require('../utils/mailer');

const PASSWORD_RESET_OTP_LIFETIME_MS = 60 * 1000; // 60 seconds (60,000 ms)
const PASSWORD_RESET_OTP_LIFETIME_SECONDS = 60;

/**
 * Constant-time comparison of two hex SHA-256 hashes.
 */
function timingSafeHashCompare(hashA, hashB) {
  if (!hashA || !hashB || typeof hashA !== 'string' || typeof hashB !== 'string') {
    return false;
  }
  if (hashA.length !== hashB.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(hashA, 'hex'), Buffer.from(hashB, 'hex'));
  } catch (_err) {
    return false;
  }
}

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
  res.set({
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
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
    const { email } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    const buildGenericSuccessResponse = (expiresAtDate) => ({
      success: true,
      message: 'If an account exists with this email, a reset verification code has been sent.',
      expiresInSeconds: PASSWORD_RESET_OTP_LIFETIME_SECONDS,
      otpExpiresAt: expiresAtDate.toISOString(),
    });

    // Return generic message if user doesn't exist to prevent account enumeration
    if (!user) {
      const simulatedExpiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_LIFETIME_MS);
      return res.status(200).json(buildGenericSuccessResponse(simulatedExpiresAt));
    }

    // Cooldown check: 60 seconds between OTP requests
    if (user.passwordResetLastSentAt) {
      const timeSinceLastSent = Date.now() - new Date(user.passwordResetLastSentAt).getTime();
      if (timeSinceLastSent < PASSWORD_RESET_OTP_LIFETIME_MS) {
        const retryAfterSeconds = Math.ceil((PASSWORD_RESET_OTP_LIFETIME_MS - timeSinceLastSent) / 1000);
        return res.status(429).json({
          success: false,
          message: 'Please wait 60 seconds before requesting another verification code.',
          retryAfterSeconds,
        });
      }
    }

    // Generate cryptographically secure random 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashToken(otp);
    const issuedAt = Date.now();
    const otpExpiresAt = new Date(issuedAt + PASSWORD_RESET_OTP_LIFETIME_MS); // Exactly 60 seconds (60,000 ms)

    // Store hashed OTP, purpose, expiry, reset attempts, and invalidate any earlier OTP or reset token
    user.passwordResetOtpHash = otpHash;
    user.passwordResetOtpExpiresAt = otpExpiresAt;
    user.passwordResetPurpose = 'password-reset';
    user.passwordResetAttempts = 0;
    user.passwordResetLastSentAt = new Date(issuedAt);
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    await user.save();

    try {
      await mailer.sendPasswordResetEmail(user.email, otp);
    } catch (mailError) {
      const safeDiagnostic =
        mailError?.safeDiagnostic ||
        (typeof mailer.sanitizeMailError === 'function'
          ? mailer.sanitizeMailError(mailError, 'FORGOT_PASSWORD_SEND')
          : {
              code: mailError?.code || 'EMAIL_DELIVERY_ERROR',
              operation: mailError?.command || 'SMTP_SEND',
              responseCode: mailError?.responseCode || null,
            });

      if (process.env.NODE_ENV !== 'test') {
        console.error('[Auth] Forgot password email delivery failed:', safeDiagnostic);
      }

      // Clear OTP state on email delivery failure so an undelivered OTP cannot be used
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      user.passwordResetPurpose = null;
      user.passwordResetAttempts = 0;
      user.passwordResetLastSentAt = null;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
      });
    }

    return res.status(200).json(buildGenericSuccessResponse(otpExpiresAt));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/verify-reset-otp
 */
async function verifyResetOtp(req, res, next) {
  try {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedOtp = String(otp).trim();

    if (!/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be a 6-digit number',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code',
      });
    }

    // Verify purpose if explicitly set
    if (user.passwordResetPurpose && user.passwordResetPurpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code',
      });
    }

    // Check expiration: reject when Date.now() >= passwordResetOtpExpiresAt
    if (Date.now() >= new Date(user.passwordResetOtpExpiresAt).getTime()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      user.passwordResetPurpose = null;
      user.passwordResetAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        code: 'OTP_EXPIRED',
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Check maximum attempts (limit to 5 incorrect attempts)
    if (user.passwordResetAttempts >= 5) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      user.passwordResetPurpose = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new verification code.',
      });
    }

    // Compare hash of provided OTP in constant time
    const inputHash = hashToken(normalizedOtp);
    if (!timingSafeHashCompare(inputHash, user.passwordResetOtpHash)) {
      user.passwordResetAttempts += 1;
      if (user.passwordResetAttempts >= 5) {
        user.passwordResetOtpHash = null;
        user.passwordResetOtpExpiresAt = null;
        user.passwordResetPurpose = null;
        await user.save();
        return res.status(400).json({
          success: false,
          message: 'Too many incorrect attempts. Please request a new verification code.',
        });
      }
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid verification code',
      });
    }

    // Mark OTP as consumed and issue a short-lived, single-use password-reset authorization
    const resetToken = generatePasswordResetToken(user._id);
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.passwordResetAttempts = 0;
    user.passwordResetPurpose = 'password-reset';
    user.passwordResetTokenHash = hashToken(resetToken);
    user.passwordResetTokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_MAX_AGE); // 10 minutes
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Verification code confirmed. You may now reset your password.',
      resetToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res, next) {
  try {
    const { resetToken, email, otp, newPassword } = req.body || {};

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'New password and valid reset authorization are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Primary flow: Single-use password-reset authorization issued by /api/auth/verify-reset-otp
    if (resetToken) {
      if (typeof resetToken !== 'string' || !resetToken.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired password reset authorization',
        });
      }

      let decoded;
      try {
        decoded = verifyPasswordResetToken(resetToken.trim());
      } catch (_err) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired password reset authorization. Please request a new verification code.',
        });
      }

      const user = await User.findById(decoded.userId);
      if (!user || !user.passwordResetTokenHash || !user.passwordResetTokenExpiresAt) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired password reset authorization. Please request a new verification code.',
        });
      }

      if (user.passwordResetPurpose && user.passwordResetPurpose !== 'password-reset') {
        return res.status(400).json({
          success: false,
          message: 'Invalid password reset authorization purpose.',
        });
      }

      if (email && typeof email === 'string' && email.trim().toLowerCase() !== user.email) {
        return res.status(400).json({
          success: false,
          message: 'Invalid password reset authorization.',
        });
      }

      if (Date.now() >= new Date(user.passwordResetTokenExpiresAt).getTime()) {
        user.passwordResetTokenHash = null;
        user.passwordResetTokenExpiresAt = null;
        user.passwordResetPurpose = null;
        await user.save();

        return res.status(400).json({
          success: false,
          message: 'Password reset authorization has expired. Please request a new verification code.',
        });
      }

      const incomingTokenHash = hashToken(resetToken.trim());
      if (!timingSafeHashCompare(incomingTokenHash, user.passwordResetTokenHash)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired password reset authorization. Please request a new verification code.',
        });
      }

      // Hash new password, consume reset authorization, and invalidate all sessions & OTPs
      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.passwordResetTokenHash = null;
      user.passwordResetTokenExpiresAt = null;
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      user.passwordResetPurpose = null;
      user.passwordResetAttempts = 0;
      user.passwordResetLastSentAt = null;
      user.refreshTokenHash = null;
      await user.save();

      clearAuthCookies(res);

      return res.status(200).json({
        success: true,
        message: 'Password reset successful. Please log in with your new password.',
      });
    }

    // Legacy compatibility flow: requires email + 6-digit OTP + newPassword (never email + newPassword alone)
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Valid password reset authorization is required',
      });
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be a 6-digit number',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code',
      });
    }

    // Check expiration: reject when Date.now() >= passwordResetOtpExpiresAt
    if (Date.now() >= new Date(user.passwordResetOtpExpiresAt).getTime()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      user.passwordResetPurpose = null;
      user.passwordResetAttempts = 0;
      await user.save();

      return res.status(400).json({
        success: false,
        code: 'OTP_EXPIRED',
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Check maximum attempts (limit to 5 incorrect attempts)
    if (user.passwordResetAttempts >= 5) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      user.passwordResetPurpose = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new verification code.',
      });
    }

    // Compare hash of provided OTP in constant time
    const inputHash = hashToken(String(otp));
    if (!timingSafeHashCompare(inputHash, user.passwordResetOtpHash)) {
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
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    user.passwordResetPurpose = null;
    user.passwordResetAttempts = 0;
    user.passwordResetLastSentAt = null;
    user.refreshTokenHash = null; // Invalidate all active refresh sessions
    await user.save();

    clearAuthCookies(res);

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
  verifyResetOtp,
  resetPassword,
  PASSWORD_RESET_OTP_LIFETIME_MS,
  PASSWORD_RESET_OTP_LIFETIME_SECONDS,
};
