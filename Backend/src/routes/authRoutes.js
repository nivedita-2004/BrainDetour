const express = require('express');
const {
  signup,
  login,
  refresh,
  logout,
  getMe,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  loginLimiter,
  passwordResetLimiter,
  verifyResetOtpLimiter,
  resetPasswordSubmitLimiter,
} = require('../middleware/rateLimiters');

const router = express.Router();

// Anti-caching protection for authentication endpoints:
// Ensures private user sessions, tokens, and identity responses are never cached by
// intermediate proxies (e.g. Vercel, Render), browsers, or in-app WebViews (e.g. WhatsApp)
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  next();
});

router.post('/signup', signup);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);

router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/verify-reset-otp', verifyResetOtpLimiter, verifyResetOtp);
router.post('/reset-password', resetPasswordSubmitLimiter, resetPassword);

module.exports = router;
