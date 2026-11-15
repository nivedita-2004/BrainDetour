const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const User = require('../src/models/User');
const mailer = require('../src/utils/mailer');
const {
  generateAccessToken,
  generatePasswordResetToken,
  hashToken,
} = require('../src/utils/tokens');

let mongod;
let server;
let baseUrl;
let lastSentEmail = null;
let lastTransporterConfig = null;
let simulatedSmtpError = null;

const originalCreateTransport = nodemailer.createTransport;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_minimum_32_characters';
  process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_minimum_32_characters';
  process.env.JWT_SECRET = 'test_access_token_secret_minimum_32_characters';

  // Configure valid test SMTP environment variables for mocked transporter
  process.env.EMAIL_HOST = 'smtp.gmail.com';
  process.env.EMAIL_PORT = '587';
  process.env.EMAIL_USER = 'mailer.service@gmail.com';
  process.env.EMAIL_PASS = 'abcd efgh ijkl mnop'; // Tests Gmail 4x4 App Password space normalization
  process.env.EMAIL_FROM = 'mailer.service@gmail.com';
  process.env.ENFORCE_EMAIL_CONFIG_IN_TEST = 'true';

  // Mock Nodemailer createTransport so the full mailer.js code path executes safely without sending external emails
  nodemailer.createTransport = (transportConfig) => {
    lastTransporterConfig = transportConfig;
    return {
      verify: async () => {
        if (simulatedSmtpError) {
          throw simulatedSmtpError;
        }
        return true;
      },
      sendMail: async (mailOptions) => {
        if (simulatedSmtpError) {
          throw simulatedSmtpError;
        }
        const otpMatch = String(mailOptions.text || '').match(/\b(\d{6})\b/);
        lastSentEmail = {
          toEmail: mailOptions.to,
          from: mailOptions.from,
          subject: mailOptions.subject,
          otp: otpMatch ? otpMatch[1] : null,
          mailOptions,
        };
        return { messageId: '<mock-message-id@braindetour.test>' };
      },
    };
  };

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  // Ensure test database is strictly local memory server and never Atlas
  assert.ok(
    uri.startsWith('mongodb://127.0.0.1:') || uri.startsWith('mongodb://localhost:'),
    'Tests must run exclusively against isolated local MongoMemoryServer'
  );
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
  nodemailer.createTransport = originalCreateTransport;
  delete process.env.ENFORCE_EMAIL_CONFIG_IN_TEST;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

describe('Part A: Backend Forgot Password, OTP Verification & Reset Authorization Suite', () => {
  const scholar = {
    name: 'Dr. Elena Vance',
    email: 'elena.vance@braindetour.local',
    password: 'InitialPassword123!',
    newPassword: 'UpdatedSecurePassword456!',
  };

  let initialRefreshCookie = null;

  test('Setup: Register test scholar and capture initial session', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: scholar.name,
        email: scholar.email,
        password: scholar.password,
      }),
    });
    assert.strictEqual(res.status, 201);
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const refreshHeader = setCookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(refreshHeader, 'Signup must set refreshToken cookie');
    initialRefreshCookie = refreshHeader.split(';')[0];
  });

  test('1. POST /api/auth/forgot-password validates email input', async () => {
    const emptyRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '   ' }),
    });
    assert.strictEqual(emptyRes.status, 400);

    const invalidRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.strictEqual(invalidRes.status, 400);
  });

  test('2. Account-enumeration protection: existing and non-existent emails return identical generic response and 60s OTP expiry', async () => {
    lastSentEmail = null;
    const unknownRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent.user@braindetour.local' }),
    });
    assert.strictEqual(unknownRes.status, 200);
    const unknownData = await unknownRes.json();
    assert.strictEqual(unknownData.success, true);
    assert.strictEqual(
      unknownData.message,
      'If an account exists with this email, a reset verification code has been sent.'
    );
    assert.strictEqual(unknownData.expiresInSeconds, 60);
    assert.ok(unknownData.otpExpiresAt, 'Response must include server-issued otpExpiresAt');
    assert.strictEqual(unknownData.otp, undefined, 'API must never return OTP');
    assert.strictEqual(lastSentEmail, null, 'No email should be sent for unknown address');

    const beforeKnownMs = Date.now();
    const knownRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `  ${scholar.email.toUpperCase()}  ` }),
    });
    const afterKnownMs = Date.now();
    assert.strictEqual(knownRes.status, 200);
    const knownData = await knownRes.json();
    assert.strictEqual(knownData.success, unknownData.success);
    assert.strictEqual(knownData.message, unknownData.message);
    assert.strictEqual(knownData.expiresInSeconds, 60);
    assert.ok(knownData.otpExpiresAt, 'Known email response must include server-issued otpExpiresAt');
    assert.deepStrictEqual(
      Object.keys(knownData).sort(),
      Object.keys(unknownData).sort(),
      'Response keys for existing and non-existent email must be identical'
    );
    assert.ok(lastSentEmail, 'OTP email must be dispatched for registered user');
    assert.strictEqual(lastSentEmail.toEmail, scholar.email);
    assert.strictEqual(lastSentEmail.from, '"BrainDetour" <mailer.service@gmail.com>');
    assert.match(lastSentEmail.otp, /^\d{6}$/, 'Generated OTP must be 6 digits');

    // Verify transporter configuration normalized Gmail App Password spaces and STARTTLS port
    assert.ok(lastTransporterConfig, 'Nodemailer createTransport must be called');
    assert.strictEqual(lastTransporterConfig.host, 'smtp.gmail.com');
    assert.strictEqual(lastTransporterConfig.port, 587);
    assert.strictEqual(lastTransporterConfig.secure, false);
    assert.strictEqual(lastTransporterConfig.requireTLS, true);
    assert.strictEqual(
      lastTransporterConfig.auth.pass,
      'abcdefghijklmnop',
      'Gmail App Password spaces must be stripped automatically'
    );

    // Verify verifyEmailTransport succeeds with valid mocked transporter
    const verifyStatus = await mailer.verifyEmailTransport();
    assert.strictEqual(verifyStatus.configured, true);
    assert.strictEqual(verifyStatus.verified, true);

    // Verify only hashed OTP is stored in MongoDB with exactly 60,000 ms lifetime
    const dbUser = await User.findOne({ email: scholar.email });
    assert.ok(dbUser.passwordResetOtpHash);
    assert.notStrictEqual(dbUser.passwordResetOtpHash, lastSentEmail.otp);
    assert.strictEqual(dbUser.passwordResetOtpHash, hashToken(lastSentEmail.otp));
    assert.strictEqual(dbUser.passwordResetPurpose, 'password-reset');
    assert.strictEqual(dbUser.passwordResetAttempts, 0);
    const dbExpiresMs = dbUser.passwordResetOtpExpiresAt.getTime();
    assert.ok(
      dbExpiresMs >= beforeKnownMs + 60 * 1000 && dbExpiresMs <= afterKnownMs + 60 * 1000,
      `Expected OTP expiry to be generation time + 60,000 ms, got delta ${dbExpiresMs - beforeKnownMs}ms`
    );
    assert.strictEqual(new Date(knownData.otpExpiresAt).getTime(), dbExpiresMs);
  });

  test('3. Resend cooldown blocks immediate duplicate requests and issuing new OTP invalidates previous OTP with fresh 60s expiry', async () => {
    const firstOtp = lastSentEmail.otp;

    // Immediate second request within 60s cooldown must return 429
    const cooldownRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email }),
    });
    assert.strictEqual(cooldownRes.status, 429);
    const cooldownData = await cooldownRes.json();
    assert.strictEqual(cooldownData.success, false);
    assert.ok(cooldownData.retryAfterSeconds > 0);

    // Simulate 61 seconds elapsed to allow resend
    await User.updateOne(
      { email: scholar.email },
      { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
    );

    const beforeResendMs = Date.now();
    const resendRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email }),
    });
    const afterResendMs = Date.now();
    assert.strictEqual(resendRes.status, 200);
    const resendData = await resendRes.json();
    assert.strictEqual(resendData.expiresInSeconds, 60);
    const secondOtp = lastSentEmail.otp;

    // Verify new OTP is valid for 60 seconds from resend time
    const dbUserAfterResend = await User.findOne({ email: scholar.email });
    const resendExpiresMs = dbUserAfterResend.passwordResetOtpExpiresAt.getTime();
    assert.ok(
      resendExpiresMs >= beforeResendMs + 60 * 1000 && resendExpiresMs <= afterResendMs + 60 * 1000,
      'Resent OTP must have a fresh 60,000 ms validity window'
    );

    // Ensure previous OTP is invalidated even if we force a distinct previous OTP value check
    const distinctOldOtp = secondOtp === '123456' ? '654321' : '123456';
    const oldOtpToTest = firstOtp !== secondOtp ? firstOtp : distinctOldOtp;
    const oldOtpRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email, otp: oldOtpToTest }),
    });
    assert.strictEqual(oldOtpRes.status, 400);
  });

  test('4. Missing email configuration, SMTP auth failure (EAUTH 535), and SMTP connection failure (ECONNECTION) safely clear OTP state and return HTTP 500', async () => {
    // 4a. Missing email configuration (EMAIL_NOT_CONFIGURED)
    await User.updateOne(
      { email: scholar.email },
      { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
    );
    const savedUser = process.env.EMAIL_USER;
    const savedPass = process.env.EMAIL_PASS;

    try {
      process.env.EMAIL_USER = 'your_email@gmail.com';
      process.env.EMAIL_PASS = '';

      const unconfiguredVerify = await mailer.verifyEmailTransport();
      assert.strictEqual(unconfiguredVerify.configured, false);
      assert.strictEqual(unconfiguredVerify.verified, false);
      assert.strictEqual(unconfiguredVerify.code, 'EMAIL_NOT_CONFIGURED');

      const missingConfigRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(missingConfigRes.status, 500);
      const missingConfigData = await missingConfigRes.json();
      assert.strictEqual(missingConfigData.success, false);
      assert.strictEqual(
        missingConfigData.message,
        'Failed to send verification email. Please try again later.'
      );
      assert.strictEqual(missingConfigData.stack, undefined, 'Must never expose stack trace');

      const dbUserAfterMissing = await User.findOne({ email: scholar.email });
      assert.strictEqual(dbUserAfterMissing.passwordResetOtpHash, null);
      assert.strictEqual(dbUserAfterMissing.passwordResetOtpExpiresAt, null);
      assert.strictEqual(dbUserAfterMissing.passwordResetPurpose, null);
      assert.strictEqual(dbUserAfterMissing.passwordResetLastSentAt, null);
    } finally {
      process.env.EMAIL_USER = savedUser;
      process.env.EMAIL_PASS = savedPass;
    }

    // 4b. SMTP authentication failure (EAUTH / AUTH PLAIN / 535-5.7.8)
    const authErr = new Error(
      'Invalid login: 535-5.7.8 Username and Password not accepted for mailer.service@gmail.com'
    );
    authErr.code = 'EAUTH';
    authErr.command = 'AUTH PLAIN';
    authErr.responseCode = 535;
    simulatedSmtpError = authErr;

    try {
      const verifyAuthFail = await mailer.verifyEmailTransport();
      assert.strictEqual(verifyAuthFail.configured, true);
      assert.strictEqual(verifyAuthFail.verified, false);
      assert.strictEqual(verifyAuthFail.error.code, 'EAUTH');
      assert.strictEqual(verifyAuthFail.error.command, 'AUTH PLAIN');
      assert.strictEqual(verifyAuthFail.error.responseCode, 535);
      assert.ok(
        !verifyAuthFail.error.message.includes('mailer.service@gmail.com'),
        'Sanitized error diagnostic must redact email addresses'
      );

      const authFailRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(authFailRes.status, 500);
      const authFailData = await authFailRes.json();
      assert.strictEqual(authFailData.success, false);
      assert.strictEqual(
        authFailData.message,
        'Failed to send verification email. Please try again later.'
      );

      const dbUserAfterAuthFail = await User.findOne({ email: scholar.email });
      assert.strictEqual(dbUserAfterAuthFail.passwordResetOtpHash, null);
      assert.strictEqual(dbUserAfterAuthFail.passwordResetOtpExpiresAt, null);
      assert.strictEqual(dbUserAfterAuthFail.passwordResetPurpose, null);
      assert.strictEqual(dbUserAfterAuthFail.passwordResetLastSentAt, null);
    } finally {
      simulatedSmtpError = null;
    }

    // 4c. SMTP connection failure (ECONNECTION / CONN / ECONNREFUSED)
    const connErr = new Error('connect ECONNREFUSED 127.0.0.1:587');
    connErr.code = 'ECONNECTION';
    connErr.command = 'CONN';
    simulatedSmtpError = connErr;

    try {
      const connFailRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(connFailRes.status, 500);
      const connFailData = await connFailRes.json();
      assert.strictEqual(connFailData.success, false);

      const dbUserAfterConnFail = await User.findOne({ email: scholar.email });
      assert.strictEqual(dbUserAfterConnFail.passwordResetOtpHash, null);
      assert.strictEqual(dbUserAfterConnFail.passwordResetOtpExpiresAt, null);
      assert.strictEqual(dbUserAfterConnFail.passwordResetPurpose, null);
      assert.strictEqual(
        dbUserAfterConnFail.passwordResetLastSentAt,
        null,
        'Failed delivery must clear passwordResetLastSentAt so user can immediately retry'
      );
    } finally {
      simulatedSmtpError = null;
    }
  });

  test('5. Controlled server time: OTP is accepted before 60s expiry, rejected at exact 60s boundary (Date.now() === expiresAt), and rejected after expiry without issuing resetToken', async () => {
    const realDateNow = Date.now;
    let fakeNow = realDateNow();

    try {
      Date.now = () => fakeNow;

      // Clear any previous cooldown
      await User.updateOne(
        { email: scholar.email },
        { passwordResetLastSentAt: new Date(fakeNow - 61 * 1000) }
      );

      // 5a. Issue OTP at T0 and verify at T0 + 59,999 ms (1 ms before expiry) -> ACCEPTED
      const t0 = fakeNow;
      const reqBeforeRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(reqBeforeRes.status, 200);
      const otpBefore = lastSentEmail.otp;

      const userAtT0 = await User.findOne({ email: scholar.email });
      assert.strictEqual(userAtT0.passwordResetOtpExpiresAt.getTime(), t0 + 60 * 1000);

      fakeNow = t0 + 59999; // 59.999 seconds elapsed (before expiry)
      const verifyBeforeRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email, otp: otpBefore }),
      });
      assert.strictEqual(verifyBeforeRes.status, 200);
      const verifyBeforeData = await verifyBeforeRes.json();
      assert.strictEqual(verifyBeforeData.success, true);
      assert.ok(verifyBeforeData.resetToken, 'Valid OTP before 60s must issue resetToken');

      // Confirm resetToken retains its independent 10-minute lifetime (600,000 ms)
      const userAfterVerify = await User.findOne({ email: scholar.email });
      assert.strictEqual(
        userAfterVerify.passwordResetTokenExpiresAt.getTime(),
        fakeNow + 10 * 60 * 1000,
        'resetToken expiry must remain 10 minutes and not be shortened to 60s'
      );

      // 5b. Issue OTP at T1 and verify at EXACT boundary T1 + 60,000 ms (Date.now() === expiresAt) -> REJECTED
      const t1 = t0 + 61 * 1000;
      fakeNow = t1;
      const reqExactRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(reqExactRes.status, 200);
      const otpExact = lastSentEmail.otp;

      fakeNow = t1 + 60 * 1000; // Exact 60,000 ms expiration timestamp
      const verifyExactRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email, otp: otpExact }),
      });
      assert.strictEqual(verifyExactRes.status, 400);
      const verifyExactData = await verifyExactRes.json();
      assert.strictEqual(verifyExactData.success, false);
      assert.strictEqual(verifyExactData.code, 'OTP_EXPIRED');
      assert.strictEqual(verifyExactData.message, 'OTP has expired. Please request a new OTP.');
      assert.strictEqual(
        verifyExactData.resetToken,
        undefined,
        'Expired OTP at exact boundary must never produce a resetToken'
      );

      const dbUserAtExact = await User.findOne({ email: scholar.email });
      assert.strictEqual(dbUserAtExact.passwordResetOtpHash, null);
      assert.strictEqual(dbUserAtExact.passwordResetOtpExpiresAt, null);
      assert.strictEqual(dbUserAtExact.passwordResetTokenHash, null);

      // 5c. Issue OTP at T2 and verify AFTER expiry (T2 + 75,000 ms) -> REJECTED
      const t2 = t1 + 61 * 1000;
      fakeNow = t2;
      const reqAfterRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(reqAfterRes.status, 200);
      const otpAfter = lastSentEmail.otp;

      fakeNow = t2 + 75 * 1000; // 75 seconds elapsed (after expiry)
      const verifyAfterRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email, otp: otpAfter }),
      });
      assert.strictEqual(verifyAfterRes.status, 400);
      const verifyAfterData = await verifyAfterRes.json();
      assert.strictEqual(verifyAfterData.success, false);
      assert.strictEqual(verifyAfterData.code, 'OTP_EXPIRED');
      assert.match(verifyAfterData.message, /expired/i);
      assert.strictEqual(
        verifyAfterData.resetToken,
        undefined,
        'Expired OTP after 60s must never produce a resetToken'
      );

      const dbUserAfterExpiry = await User.findOne({ email: scholar.email });
      assert.strictEqual(dbUserAfterExpiry.passwordResetOtpHash, null);
      assert.strictEqual(dbUserAfterExpiry.passwordResetOtpExpiresAt, null);
      assert.strictEqual(dbUserAfterExpiry.passwordResetTokenHash, null);
    } finally {
      Date.now = realDateNow;
      await User.updateOne(
        { email: scholar.email },
        { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
      );
    }
  });

  test('6. POST /api/auth/verify-reset-otp enforces maximum 5 failed attempts and locks OTP', async () => {
    await User.updateOne(
      { email: scholar.email },
      { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
    );
    const reqRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email }),
    });
    assert.strictEqual(reqRes.status, 200);
    const realOtp = lastSentEmail.otp;
    const wrongOtp = realOtp === '000000' ? '111111' : '000000';

    // Attempts 1 to 4: Invalid verification code
    for (let i = 1; i <= 4; i++) {
      const res = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email, otp: wrongOtp }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.message, 'Invalid verification code');
    }

    // Attempt 5: Reaches threshold -> locks and invalidates OTP
    const fifthRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email, otp: wrongOtp }),
    });
    assert.strictEqual(fifthRes.status, 400);
    const fifthData = await fifthRes.json();
    assert.match(fifthData.message, /Too many incorrect attempts/i);

    // Even submitting the real OTP now must fail because OTP was invalidated
    const afterLockRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email, otp: realOtp }),
    });
    assert.strictEqual(afterLockRes.status, 400);
  });

  test('7. OTP verification consumes OTP (preventing OTP reuse) and issues bound resetToken', async () => {
    await User.updateOne(
      { email: scholar.email },
      { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
    );
    await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email }),
    });
    const validOtp = lastSentEmail.otp;

    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email, otp: validOtp }),
    });
    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.success, true);
    assert.ok(verifyData.resetToken, 'Must issue temporary resetToken');

    // Verify OTP was consumed in DB and resetTokenHash was stored
    const dbUser = await User.findOne({ email: scholar.email });
    assert.strictEqual(dbUser.passwordResetOtpHash, null, 'OTP hash must be cleared upon verification');
    assert.strictEqual(dbUser.passwordResetTokenHash, hashToken(verifyData.resetToken));
    assert.ok(dbUser.passwordResetTokenExpiresAt.getTime() > Date.now());

    // Attempting to reuse the same OTP again must fail
    const reuseOtpRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email, otp: validOtp }),
    });
    assert.strictEqual(reuseOtpRes.status, 400);
  });

  test('8. POST /api/auth/reset-password rejects missing authorization, wrong purpose, or expired resetToken', async () => {
    // 8a. Attempting password update with only email + newPassword (no resetToken) must fail
    const noAuthRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: scholar.email,
        newPassword: scholar.newPassword,
      }),
    });
    assert.strictEqual(noAuthRes.status, 400);

    // 8b. Attempting to use a normal access token as resetToken must fail
    const dbUser = await User.findOne({ email: scholar.email });
    const accessToken = generateAccessToken(dbUser._id);
    const wrongTypeRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken: accessToken,
        newPassword: scholar.newPassword,
      }),
    });
    assert.strictEqual(wrongTypeRes.status, 400);

    // 8c. Expired resetToken in database must fail
    await User.updateOne(
      { email: scholar.email },
      { passwordResetTokenExpiresAt: new Date(Date.now() - 1000) }
    );
    const expiredToken = generatePasswordResetToken(dbUser._id);
    await User.updateOne(
      { email: scholar.email },
      {
        passwordResetTokenHash: hashToken(expiredToken),
        passwordResetTokenExpiresAt: new Date(Date.now() - 1000),
      }
    );

    const expiredResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken: expiredToken,
        newPassword: scholar.newPassword,
      }),
    });
    assert.strictEqual(expiredResetRes.status, 400);
    const expiredResetData = await expiredResetRes.json();
    assert.match(expiredResetData.message, /expired/i);
  });

  test('9. Complete end-to-end reset updates password, prevents resetToken reuse, invalidates refresh sessions, and allows new login', async () => {
    // Step 1: Request new OTP
    await User.updateOne(
      { email: scholar.email },
      { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
    );
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email }),
    });
    assert.strictEqual(forgotRes.status, 200);

    // Step 2: Verify OTP to obtain single-use resetToken
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: scholar.email, otp: lastSentEmail.otp }),
    });
    assert.strictEqual(verifyRes.status, 200);
    const { resetToken } = await verifyRes.json();
    assert.ok(resetToken);

    // Step 3: Reset password using resetToken
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken,
        email: scholar.email,
        newPassword: scholar.newPassword,
      }),
    });
    assert.strictEqual(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.success, true);

    // Step 4: Reusing the same resetToken a second time must fail
    const reuseTokenRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken,
        newPassword: 'AnotherPassword789!',
      }),
    });
    assert.strictEqual(reuseTokenRes.status, 400);

    // Step 5: Old refresh token session must be invalidated
    const oldRefreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: initialRefreshCookie },
    });
    assert.strictEqual(oldRefreshRes.status, 401);

    // Step 6: Old password must no longer work
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: scholar.email,
        password: scholar.password,
      }),
    });
    assert.strictEqual(oldLoginRes.status, 401);

    // Step 7: New password logs in successfully
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: scholar.email,
        password: scholar.newPassword,
      }),
    });
    assert.strictEqual(newLoginRes.status, 200);
    const newLoginData = await newLoginRes.json();
    assert.strictEqual(newLoginData.success, true);
    assert.strictEqual(newLoginData.user.email, scholar.email);
  });

  test('10. Live TCP SMTP transport: end-to-end AUTH PLAIN delivery and 535 EAUTH rejection', async () => {
    const net = require('node:net');
    let rejectAuth = false;
    let receivedRawData = '';
    let receivedAuthToken = '';

    const smtpServer = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.write('220 127.0.0.1 ESMTP BrainDetourLocalTest\r\n');
      let inDataMode = false;
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk;
        if (inDataMode) {
          const endIdx = buffer.indexOf('\r\n.\r\n');
          if (endIdx !== -1) {
            receivedRawData = buffer.slice(0, endIdx);
            buffer = buffer.slice(endIdx + 5);
            inDataMode = false;
            socket.write('250 2.0.0 OK: queued as local-test-message\r\n');
          }
          return;
        }

        let lineEnd;
        while ((lineEnd = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 2);
          const upper = line.toUpperCase();

          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-127.0.0.1 Hello\r\n250 AUTH PLAIN LOGIN\r\n');
          } else if (upper.startsWith('AUTH PLAIN')) {
            receivedAuthToken = line.slice('AUTH PLAIN'.length).trim();
            if (rejectAuth) {
              socket.write('535 5.7.8 Username and Password not accepted\r\n');
            } else {
              socket.write('235 2.7.0 Accepted\r\n');
            }
          } else if (upper.startsWith('MAIL FROM:')) {
            socket.write('250 2.1.0 OK\r\n');
          } else if (upper.startsWith('RCPT TO:')) {
            socket.write('250 2.1.5 OK\r\n');
          } else if (upper === 'DATA') {
            inDataMode = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
            break;
          } else if (upper.startsWith('QUIT')) {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 OK\r\n');
          }
        }
      });
    });

    await new Promise((resolve) => smtpServer.listen(0, '127.0.0.1', resolve));
    const smtpPort = smtpServer.address().port;

    const prevHost = process.env.EMAIL_HOST;
    const prevPort = process.env.EMAIL_PORT;
    const prevMock = nodemailer.createTransport;

    try {
      // Restore real Nodemailer transport pointing at our live local TCP SMTP server
      nodemailer.createTransport = originalCreateTransport;
      process.env.EMAIL_HOST = '127.0.0.1';
      process.env.EMAIL_PORT = String(smtpPort);

      await User.updateOne(
        { email: scholar.email },
        { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
      );

      // Case A: Live TCP SMTP server accepts AUTH PLAIN and receives full MIME email
      const liveRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(liveRes.status, 200);
      assert.ok(receivedAuthToken, 'Real Nodemailer transport must send AUTH PLAIN token');
      assert.ok(
        receivedRawData.includes('BrainDetour') && receivedRawData.includes(scholar.email),
        'Live SMTP server must receive MIME message addressed to registered user'
      );

      const matchedOtp = receivedRawData.match(/\b(\d{6})\b/);
      assert.ok(matchedOtp, 'Delivered MIME email must contain 6-digit OTP');

      const verifyLiveOtpRes = await fetch(`${baseUrl}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email, otp: matchedOtp[1] }),
      });
      assert.strictEqual(verifyLiveOtpRes.status, 200);

      // Case B: Live TCP SMTP server rejects AUTH PLAIN with 535 5.7.8 -> HTTP 500 & OTP cleanup
      rejectAuth = true;
      await User.updateOne(
        { email: scholar.email },
        { passwordResetLastSentAt: new Date(Date.now() - 61 * 1000) }
      );

      const failLiveRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: scholar.email }),
      });
      assert.strictEqual(failLiveRes.status, 500);
      const dbUserAfter535 = await User.findOne({ email: scholar.email });
      assert.strictEqual(dbUserAfter535.passwordResetOtpHash, null);
    } finally {
      nodemailer.createTransport = prevMock;
      process.env.EMAIL_HOST = prevHost;
      process.env.EMAIL_PORT = prevPort;
      await new Promise((resolve) => smtpServer.close(resolve));
    }
  });
});

describe('Part B & C: Frontend Password Reset Validation, Route Guards & Blog Navigation Suite', () => {
  test('1. ForgotPasswordPage validateResetEmail validates and normalizes email inputs', async () => {
    const { validateResetEmail } = await import('../../Frontend/src/features/auth/passwordResetUtils.js');

    assert.strictEqual(validateResetEmail('').valid, false);
    assert.strictEqual(validateResetEmail('   ').valid, false);
    assert.strictEqual(validateResetEmail('invalid-email').valid, false);
    assert.strictEqual(validateResetEmail('missing@domain').valid, false);

    const valid = validateResetEmail('  Scholar.User@BrainDetour.EDU ');
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.normalizedEmail, 'scholar.user@braindetour.edu');
  });

  test('2. VerifyResetOtpPage maskEmail and validateOtpCode behave accurately', async () => {
    const { maskEmail, validateOtpCode } = await import('../../Frontend/src/features/auth/passwordResetUtils.js');

    assert.strictEqual(maskEmail('curious.scholar@braindetour.edu'), 'cu***r@braindetour.edu');
    assert.strictEqual(maskEmail('ab@domain.com'), 'a***@domain.com');
    assert.strictEqual(maskEmail('alex@domain.com'), 'a***x@domain.com');
    assert.strictEqual(maskEmail(''), '');

    assert.strictEqual(validateOtpCode('').valid, false);
    assert.strictEqual(validateOtpCode('12345').valid, false);
    assert.strictEqual(validateOtpCode('12345a').valid, false);
    assert.strictEqual(validateOtpCode('1234567').valid, false);

    const validOtp = validateOtpCode(' 482910 ');
    assert.strictEqual(validOtp.valid, true);
    assert.strictEqual(validOtp.otp, '482910');
  });

  test('3. ResetPasswordPage validatePasswordResetInput enforces length and confirmation match', async () => {
    const { validatePasswordResetInput } = await import('../../Frontend/src/features/auth/passwordResetUtils.js');

    assert.strictEqual(validatePasswordResetInput('', '').valid, false);
    assert.strictEqual(validatePasswordResetInput('short7', 'short7').valid, false);
    assert.match(validatePasswordResetInput('short7', 'short7').error, /at least 8 characters/i);

    const mismatch = validatePasswordResetInput('ValidPassword123!', 'DifferentPassword123!');
    assert.strictEqual(mismatch.valid, false);
    assert.match(mismatch.error, /do not match/i);

    const matching = validatePasswordResetInput('ValidPassword123!', 'ValidPassword123!');
    assert.strictEqual(matching.valid, true);
  });

  test('4. Direct navigation guards and zero localStorage exposure on reset routes', () => {
    const verifyPageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../Frontend/src/pages/VerifyResetOtpPage.jsx'),
      'utf8'
    );
    const resetPageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../Frontend/src/pages/ResetPasswordPage.jsx'),
      'utf8'
    );

    // Both pages must redirect to /forgot-password when required location.state is absent
    assert.ok(
      verifyPageSrc.includes('<Navigate to="/forgot-password" replace />'),
      'VerifyResetOtpPage must guard against missing email state'
    );
    assert.ok(
      resetPageSrc.includes('<Navigate to="/forgot-password" replace />'),
      'ResetPasswordPage must guard against missing resetToken state'
    );

    // Neither page may store sensitive reset tokens or OTPs in localStorage or sessionStorage
    assert.ok(!verifyPageSrc.includes('localStorage'), 'VerifyResetOtpPage must not use localStorage');
    assert.ok(!resetPageSrc.includes('localStorage'), 'ResetPasswordPage must not use localStorage');
  });

  test('5. Blog navigation uses synchronous cached data and client-side React Router Links without page reload or loading flash', async () => {
    const { mockBlogService } = await import('../../Frontend/src/services/mock/blogService.js');

    // Synchronous cache availability ensures BlogPage and BlogPostPage render on Frame 1 with loading = false
    const initialPosts = mockBlogService.getCachedBlogPosts();
    assert.ok(Array.isArray(initialPosts) && initialPosts.length === 4, 'Blog posts must be synchronously available on mount');

    const firstSlug = initialPosts[0].slug;
    const initialPost = mockBlogService.getCachedBlogPostBySlug(firstSlug);
    assert.ok(initialPost && initialPost.slug === firstSlug, 'Blog post by slug must be synchronously available on mount');

    // Verify BlogPage, BlogPostPage, and Navbar use React Router Links and contain zero full-page reload calls
    const blogPageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../Frontend/src/pages/BlogPage.jsx'),
      'utf8'
    );
    const blogPostPageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../Frontend/src/pages/BlogPostPage.jsx'),
      'utf8'
    );
    const navbarSrc = fs.readFileSync(
      path.resolve(__dirname, '../../Frontend/src/components/layout/Navbar.jsx'),
      'utf8'
    );

    for (const src of [blogPageSrc, blogPostPageSrc, navbarSrc]) {
      assert.ok(!src.includes('window.location'), 'Must not use window.location for internal navigation');
      assert.ok(!src.includes('location.reload'), 'Must not trigger full document reload');
    }

    assert.ok(
      blogPageSrc.includes('mockBlogService.getCachedBlogPosts()'),
      'BlogPage must initialize state from cached posts to prevent loading flash'
    );
    assert.ok(
      blogPostPageSrc.includes('mockBlogService.getCachedBlogPostBySlug(slug)'),
      'BlogPostPage must initialize state from cached post by slug to prevent loading flash'
    );
  });

  test('6. Frontend 60s countdown synchronization, expiry enforcement, and page refresh persistence', async () => {
    const {
      OTP_VALIDITY_SECONDS,
      OTP_VALIDITY_MS,
      resolveOtpExpiresAt,
      getRemainingOtpSeconds,
      isOtpExpiredAt,
    } = await import('../../Frontend/src/features/auth/passwordResetUtils.js');

    assert.strictEqual(OTP_VALIDITY_SECONDS, 60);
    assert.strictEqual(OTP_VALIDITY_MS, 60 * 1000);

    const t0 = 1794763200000;
    const serverResponse = {
      success: true,
      expiresInSeconds: 60,
      otpExpiresAt: new Date(t0 + 60 * 1000).toISOString(),
    };

    const resolvedExpiryMs = resolveOtpExpiresAt(serverResponse, t0);
    assert.strictEqual(resolvedExpiryMs, t0 + 60 * 1000);

    // At T0: full 60 seconds remaining, not expired
    assert.strictEqual(getRemainingOtpSeconds(resolvedExpiryMs, t0), 60);
    assert.strictEqual(isOtpExpiredAt(resolvedExpiryMs, t0), false);

    // Simulated page refresh at T0 + 25,000 ms (25 seconds elapsed):
    // Must compute 35 seconds remaining from server-issued otpExpiresAt, NEVER restart to 60s
    assert.strictEqual(getRemainingOtpSeconds(resolvedExpiryMs, t0 + 25 * 1000), 35);
    assert.strictEqual(isOtpExpiredAt(resolvedExpiryMs, t0 + 25 * 1000), false);

    // 1 ms before expiry (T0 + 59,999 ms): 1 second remaining, still valid
    assert.strictEqual(getRemainingOtpSeconds(resolvedExpiryMs, t0 + 59999), 1);
    assert.strictEqual(isOtpExpiredAt(resolvedExpiryMs, t0 + 59999), false);

    // Exact expiry boundary (T0 + 60,000 ms): countdown reaches 0, OTP is expired
    assert.strictEqual(getRemainingOtpSeconds(resolvedExpiryMs, t0 + 60 * 1000), 0);
    assert.strictEqual(isOtpExpiredAt(resolvedExpiryMs, t0 + 60 * 1000), true);

    // Simulated page refresh after expiry (T0 + 75,000 ms): remains 0 / expired
    assert.strictEqual(getRemainingOtpSeconds(resolvedExpiryMs, t0 + 75 * 1000), 0);
    assert.strictEqual(isOtpExpiredAt(resolvedExpiryMs, t0 + 75 * 1000), true);

    // Missing or null otpExpiresAt on mount must never fabricate a fresh 60s timer
    assert.strictEqual(getRemainingOtpSeconds(null, t0), 0);
    assert.strictEqual(getRemainingOtpSeconds(undefined, t0), 0);
    assert.strictEqual(isOtpExpiredAt(null, t0), true);

    // Verify VerifyResetOtpPage source disables submission when isOtpExpired and displays expiry notice
    const verifyPageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../Frontend/src/pages/VerifyResetOtpPage.jsx'),
      'utf8'
    );
    assert.ok(
      verifyPageSrc.includes('OTP expired. Request a new OTP.'),
      'VerifyResetOtpPage must display "OTP expired. Request a new OTP." when countdown reaches zero'
    );
    assert.ok(
      verifyPageSrc.includes('disabled={isOtpExpired || isVerifying || isResending || combinedOtp.length < 6}'),
      'VerifyResetOtpPage submit button must be disabled when isOtpExpired is true'
    );
    assert.ok(
      verifyPageSrc.includes('if (isOtpExpired || getRemainingOtpSeconds(otpExpiresAt, Date.now()) <= 0)'),
      'VerifyResetOtpPage handleVerifySubmit must block submission when OTP has expired'
    );
  });
});
