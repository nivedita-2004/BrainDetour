const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_EXPIRY = '7m';
const REFRESH_TOKEN_EXPIRY = '15d';

const ACCESS_TOKEN_MAX_AGE = 7 * 60 * 1000; // 7 minutes in ms
const REFRESH_TOKEN_MAX_AGE = 15 * 24 * 60 * 60 * 1000; // 15 days in ms

function getAccessTokenSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
}

function getRefreshTokenSecret() {
  return process.env.REFRESH_TOKEN_SECRET;
}

/**
 * Generate a 7-minute JWT access token.
 */
function generateAccessToken(userId) {
  return jwt.sign(
    { userId: userId.toString(), tokenType: 'access' },
    getAccessTokenSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate a 15-day JWT refresh token with unique jti.
 */
function generateRefreshToken(userId) {
  return jwt.sign(
    {
      userId: userId.toString(),
      tokenType: 'refresh',
      jti: crypto.randomBytes(16).toString('hex'),
    },
    getRefreshTokenSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Compute SHA-256 hash of a token string for safe database storage.
 */
function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify access token signature and expiration.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, getAccessTokenSecret());
}

/**
 * Verify refresh token signature and expiration.
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshTokenSecret());
}

/**
 * Cookie options tailored for development vs production environments.
 */
function getCookieOptions(maxAge) {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge,
  };
}

/**
 * Set both access and refresh cookies on the HTTP response.
 */
function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, getCookieOptions(ACCESS_TOKEN_MAX_AGE));
  res.cookie('refreshToken', refreshToken, getCookieOptions(REFRESH_TOKEN_MAX_AGE));
}

/**
 * Clear both access and refresh cookies using matching attributes.
 */
function clearAuthCookies(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  const clearOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
  res.clearCookie('accessToken', clearOptions);
  res.clearCookie('refreshToken', clearOptions);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
};
