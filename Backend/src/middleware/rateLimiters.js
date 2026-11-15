const rateLimit = require('express-rate-limit');

const isTestEnv = () => process.env.NODE_ENV === 'test';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: () => (isTestEnv() ? 100 : 10),
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: () => (isTestEnv() ? 100 : 8),
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyResetOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: () => (isTestEnv() ? 100 : 15),
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: () => (isTestEnv() ? 100 : 10),
  message: {
    success: false,
    message: 'Too many password update attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  passwordResetLimiter,
  verifyResetOtpLimiter,
  resetPasswordSubmitLimiter,
};
