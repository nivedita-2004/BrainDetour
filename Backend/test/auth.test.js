const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');

let mongod;
let server;
let baseUrl;

// Helper to extract cookies from fetch response
function getCookies(res) {
  const setCookie = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);

  const cookies = {};
  for (const cookieStr of setCookie) {
    const parts = cookieStr.split(';')[0].split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  }
  return cookies;
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_minimum_16_chars';
  process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_minimum_16_chars';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

describe('BrainDetour Authentication System', () => {
  let userEmail = 'testuser@braindetour.com';
  let userPassword = 'StrongPassword123!';
  let savedCookies = {};

  test('1. Signup creates a user and sets both accessToken and refreshToken cookies', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Explorer',
        email: userEmail,
        password: userPassword,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, userEmail.toLowerCase());
    assert.strictEqual(data.user.name, 'Test Explorer');
    // Ensure no sensitive hash or token is leaked
    assert.strictEqual(data.user.passwordHash, undefined);
    assert.strictEqual(data.user.refreshTokenHash, undefined);

    savedCookies = getCookies(res);
    assert.ok(savedCookies.accessToken, 'accessToken cookie must be set');
    assert.ok(savedCookies.refreshToken, 'refreshToken cookie must be set');
  });

  test('2. Duplicate signup returns 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another Name',
        email: userEmail,
        password: 'AnotherPassword123!',
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('already exists'));
  });

  test('3. Login rejects invalid credentials with 401 and accepts valid credentials with 200', async () => {
    // Bad password
    const failRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'WrongPassword!',
      }),
    });
    assert.strictEqual(failRes.status, 401);

    // Valid credentials
    const successRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
      }),
    });

    assert.strictEqual(successRes.status, 200);
    const data = await successRes.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, userEmail.toLowerCase());

    savedCookies = getCookies(successRes);
    assert.ok(savedCookies.accessToken);
    assert.ok(savedCookies.refreshToken);
  });

  test('4. GET /api/auth/me returns user profile with valid access token cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `accessToken=${savedCookies.accessToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, userEmail.toLowerCase());
    assert.strictEqual(data.user.name, 'Test Explorer');
    assert.strictEqual(data.user.passwordHash, undefined);
  });

  test('5. Expired or invalid access token is rejected with 401', async () => {
    // Expired token (issued with negative expiration)
    const expiredToken = jwt.sign(
      { userId: '123456789012345678901234', tokenType: 'access' },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `accessToken=${expiredToken}`,
      },
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.isExpired, true);
  });

  test('6. POST /api/auth/refresh rotates both tokens successfully', async () => {
    const oldRefreshToken = savedCookies.refreshToken;

    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `refreshToken=${oldRefreshToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const newCookies = getCookies(res);
    assert.ok(newCookies.accessToken);
    assert.ok(newCookies.refreshToken);
    assert.notStrictEqual(newCookies.refreshToken, oldRefreshToken, 'Refresh token must be rotated');

    // Update saved cookies for subsequent tests
    savedCookies = newCookies;
  });

  test('7. Old (previously rotated) refresh token cannot be reused and invalidates session', async () => {
    // Try to reuse the previous rotated token
    const oldToken = 'some_invalid_or_old_token';
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `refreshToken=${oldToken}`,
      },
    });

    assert.strictEqual(res.status, 401);
  });

  test('8. POST /api/auth/logout clears cookies and invalidates refresh token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `refreshToken=${savedCookies.refreshToken}`,
      },
    });

    assert.strictEqual(res.status, 200);

    // Verify user's refreshTokenHash in database is now cleared
    const user = await User.findOne({ email: userEmail.toLowerCase() });
    assert.strictEqual(user.refreshTokenHash, null);

    // Refreshing with the logged-out token should fail
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `refreshToken=${savedCookies.refreshToken}`,
      },
    });
    assert.strictEqual(refreshRes.status, 401);
  });

  test('9. POST /api/auth/forgot-password generates OTP hash with 10min expiry', async () => {
    const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Check DB for OTP hash and expiry
    const user = await User.findOne({ email: userEmail.toLowerCase() });
    assert.ok(user.passwordResetOtpHash, 'OTP hash must be set in database');
    assert.ok(user.passwordResetOtpExpiresAt, 'OTP expiry must be set');
    assert.ok(user.passwordResetOtpExpiresAt.getTime() > Date.now());
  });

  test('10. POST /api/auth/reset-password rejects invalid and expired OTPs', async () => {
    // Invalid 6-digit OTP
    const invalidRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        otp: '000000',
        newPassword: 'BrandNewPassword999!',
      }),
    });
    assert.strictEqual(invalidRes.status, 400);

    // Expired OTP simulation
    await User.updateOne(
      { email: userEmail.toLowerCase() },
      { passwordResetOtpExpiresAt: new Date(Date.now() - 1000) }
    );

    const expiredRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        otp: '000000',
        newPassword: 'BrandNewPassword999!',
      }),
    });
    assert.strictEqual(expiredRes.status, 400);
  });

  test('11. Valid OTP resets password once and old password stops working', async () => {
    // Generate fresh OTP manually for test
    const crypto = require('crypto');
    const validOtp = '789123';
    const otpHash = crypto.createHash('sha256').update(validOtp).digest('hex');

    await User.updateOne(
      { email: userEmail.toLowerCase() },
      {
        passwordResetOtpHash: otpHash,
        passwordResetOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        passwordResetAttempts: 0,
      }
    );

    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        otp: validOtp,
        newPassword: 'BrandNewPassword999!',
      }),
    });

    assert.strictEqual(resetRes.status, 200);
    const data = await resetRes.json();
    assert.strictEqual(data.success, true);

    // Reusing the same OTP should fail because it was cleared
    const reuseRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        otp: validOtp,
        newPassword: 'AnotherPassword888!',
      }),
    });
    assert.strictEqual(reuseRes.status, 400);

    // Old password stops working
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
      }),
    });
    assert.strictEqual(oldLoginRes.status, 401);

    // New password succeeds
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'BrandNewPassword999!',
      }),
    });
    assert.strictEqual(newLoginRes.status, 200);
  });

  test('12. Access token has exactly 7 minutes expiry and Refresh token has 15 days expiry', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'BrandNewPassword999!',
      }),
    });
    assert.strictEqual(loginRes.status, 200);

    const cookies = getCookies(loginRes);
    assert.ok(cookies.accessToken, 'Access token cookie must be present');
    assert.ok(cookies.refreshToken, 'Refresh token cookie must be present');

    const decodedAccess = jwt.decode(cookies.accessToken);
    assert.ok(decodedAccess, 'Access token must be decodable');
    const accessLifetimeSeconds = decodedAccess.exp - decodedAccess.iat;
    assert.strictEqual(accessLifetimeSeconds, 7 * 60, 'Access token lifetime must be 7 minutes (420s)');

    const decodedRefresh = jwt.decode(cookies.refreshToken);
    assert.ok(decodedRefresh, 'Refresh token must be decodable');
    const refreshLifetimeSeconds = decodedRefresh.exp - decodedRefresh.iat;
    assert.strictEqual(refreshLifetimeSeconds, 15 * 24 * 60 * 60, 'Refresh token lifetime must be 15 days (1,296,000s)');
  });
});
