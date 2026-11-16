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
 * Produces a validated, sanitized diagnostic for password-reset operations (database or email).
 * Never blindly trusts pre-populated error.safeDiagnostic objects and redacts all sensitive values
 * (API keys, SMTP passwords, database URIs, email addresses, OTPs, reset tokens, and cookies).
 *
 * @param {any} error
 * @param {string} [defaultOperation='FORGOT_PASSWORD']
 */
function sanitizeResetOperationError(error, defaultOperation = 'FORGOT_PASSWORD') {
  const redact =
    typeof mailer.redactSensitiveText === 'function'
      ? mailer.redactSensitiveText
      : (v) => String(v || '');

  const source =
    error && typeof error === 'object'
      ? error.safeDiagnostic && typeof error.safeDiagnostic === 'object'
        ? { ...error, ...error.safeDiagnostic }
        : error
      : { message: String(error || 'Unexpected password reset operation error') };

  const errName = String(error?.name || source.name || '');
  const rawCode = String(source.code || errName || 'RESET_OPERATION_ERROR');
  const rawOperation = String(source.operation || source.command || defaultOperation);
  const rawMessage = String(source.message || 'Unexpected password reset operation error');

  const sanitizedCode = redact(rawCode) || 'RESET_OPERATION_ERROR';
  const sanitizedOperation = redact(rawOperation) || defaultOperation;
  const sanitizedMessage = redact(rawMessage);

  let category = 'INTERNAL_RESET_ERROR';
  if (errName === 'ValidationError' || errName === 'CastError') {
    category = 'MONGODB_VALIDATION_ERROR';
  } else if (
    errName.includes('MongoServerSelection') ||
    errName.includes('MongoNetwork') ||
    rawCode === 'ECONNREFUSED' && rawOperation.startsWith('DB_')
  ) {
    category = 'MONGODB_CONNECTION_ERROR';
  } else if (
    errName.startsWith('Mongo') ||
    errName.startsWith('Mongoose') ||
    rawOperation.startsWith('DB_')
  ) {
    category = 'MONGODB_QUERY_ERROR';
  } else if (typeof mailer.classifyMailErrorCategory === 'function') {
    category = mailer.classifyMailErrorCategory({
      code: sanitizedCode,
      responseCode: source.responseCode ?? source.statusCode,
      message: rawMessage,
      category: source.category,
    });
  }

  const config = typeof mailer.getEmailConfig === 'function' ? mailer.getEmailConfig() : null;
  const rawProvider = String(source.provider || config?.provider || 'unconfigured').toLowerCase();
  const provider =
    rawProvider === 'resend' || rawProvider === 'smtp' ? rawProvider : 'unconfigured';

  return {
    provider,
    code: sanitizedCode,
    operation: sanitizedOperation,
    category,
    message: sanitizedMessage,
  };
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

    let user;
    try {
      user = await User.findOne({ email: normalizedEmail });
    } catch (dbFindError) {
      dbFindError.operation = 'DB_FIND_USER';
      const dbDiagnostic = sanitizeResetOperationError(dbFindError, 'DB_FIND_USER');
      dbFindError.safeDiagnostic = dbDiagnostic;
      if (process.env.NODE_ENV !== 'test') {
        console.error('[Auth] Forgot password DB lookup failed:', dbDiagnostic);
      }
      throw dbFindError;
    }

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
    const resetStateUpdate = {
      passwordResetOtpHash: otpHash,
      passwordResetOtpExpiresAt: otpExpiresAt,
      passwordResetPurpose: 'password-reset',
      passwordResetAttempts: 0,
      passwordResetLastSentAt: new Date(issuedAt),
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    };

    Object.assign(user, resetStateUpdate);

    try {
      if (user instanceof User && typeof User.updateOne === 'function') {
        await User.updateOne(
          { _id: user._id },
          { $set: resetStateUpdate },
          { runValidators: true }
        );
      } else if (typeof user.save === 'function') {
        await user.save();
      }
    } catch (dbSaveError) {
      dbSaveError.operation = 'DB_SAVE_OTP';
      const dbDiagnostic = sanitizeResetOperationError(dbSaveError, 'DB_SAVE_OTP');
      dbSaveError.safeDiagnostic = dbDiagnostic;
      if (process.env.NODE_ENV !== 'test') {
        console.error('[Auth] Forgot password OTP save failed:', dbDiagnostic);
      }
      throw dbSaveError;
    }

    try {
      await mailer.sendPasswordResetEmail(user.email, otp);
    } catch (mailError) {
      const safeDiagnostic =
        typeof mailer.sanitizeMailError === 'function'
          ? mailer.sanitizeMailError(mailError, 'FORGOT_PASSWORD_SEND')
          : sanitizeResetOperationError(mailError, 'FORGOT_PASSWORD_SEND');

      if (process.env.NODE_ENV !== 'test') {
        console.error('[Auth] Forgot password email delivery failed:', safeDiagnostic);
      }

      // Clean up ONLY the newly created OTP state matching otpHash so another valid OTP or reset session is never deleted
      try {
        const cleanupFields = {
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
          passwordResetPurpose: null,
          passwordResetAttempts: 0,
          passwordResetLastSentAt: null,
        };

        if (user instanceof User && typeof User.updateOne === 'function') {
          await User.updateOne(
            {
              _id: user._id,
              passwordResetOtpHash: otpHash,
            },
            { $set: cleanupFields },
            { runValidators: true }
          );
          if (user.passwordResetOtpHash === otpHash) {
            Object.assign(user, cleanupFields);
          }
        } else if (user.passwordResetOtpHash === otpHash) {
          Object.assign(user, cleanupFields);
          if (typeof user.save === 'function') {
            await user.save();
          }
        }
      } catch (rollbackError) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            '[Auth] Forgot password OTP rollback failed:',
            sanitizeResetOperationError(rollbackError, 'DB_ROLLBACK_OTP')
          );
        }
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
        error: {
          provider: safeDiagnostic.provider || 'unconfigured',
          code: safeDiagnostic.code || 'EMAIL_DELIVERY_ERROR',
          operation: safeDiagnostic.operation || 'EMAIL_SEND',
          category: safeDiagnostic.category || 'EMAIL_DELIVERY_ERROR',
        },
      });
    }

    return res.status(200).json(buildGenericSuccessResponse(otpExpiresAt));
  } catch (error) {
    const safeDiagnostic = sanitizeResetOperationError(error, 'FORGOT_PASSWORD');
    error.safeDiagnostic = safeDiagnostic;
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Auth] Unhandled forgotPassword error:', safeDiagnostic);
    }
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
  sanitizeResetOperationError,
  PASSWORD_RESET_OTP_LIFETIME_MS,
  PASSWORD_RESET_OTP_LIFETIME_SECONDS,
};
