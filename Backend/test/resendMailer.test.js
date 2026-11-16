const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Duplex } = require('node:stream');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_SECRET = 'resend-test-access-secret-key-2026';
process.env.REFRESH_TOKEN_SECRET = 'resend-test-refresh-secret-key-2026';
process.env.ENFORCE_EMAIL_CONFIG_IN_TEST = 'true';

const app = require('../src/app');
const User = require('../src/models/User');
const mailer = require('../src/utils/mailer');
const { sanitizeResetOperationError } = require('../src/controllers/authController');
const { sanitizeErrorForLog } = require('../src/middleware/errorHandler');
const { hashToken } = require('../src/utils/tokens');

/**
 * In-process Express request dispatcher using Node's native http.IncomingMessage & http.ServerResponse.
 */
function dispatchRequest(expressApp, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    socket.remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket);
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;

    const normalizedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    let payloadBuffer = null;
    if (body !== null && body !== undefined) {
      const serialized = typeof body === 'string' ? body : JSON.stringify(body);
      payloadBuffer = Buffer.from(serialized, 'utf8');
      if (!normalizedHeaders['content-type']) {
        normalizedHeaders['content-type'] = 'application/json';
      }
      normalizedHeaders['content-length'] = String(payloadBuffer.length);
    }

    req.headers = normalizedHeaders;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket);

    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, encoding, cb) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      }
      return origWrite(chunk, encoding, cb);
    };

    res.end = (chunk, encoding, cb) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      }
      origEnd(chunk, encoding, cb);

      const rawBody = Buffer.concat(chunks).toString('utf8');
      let parsedBody = rawBody;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch (_err) {
        // Keep raw string
      }

      const rawHeaders = res.getHeaders();
      const responseHeaders = {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        responseHeaders[k.toLowerCase()] = v;
      }

      resolve({
        status: res.statusCode,
        headers: responseHeaders,
        body: parsedBody,
      });
    };

    res.on('error', reject);
    expressApp(req, res);

    if (payloadBuffer) {
      req.push(payloadBuffer);
    }
    req.push(null);
  });
}

describe('Resend & Gmail SMTP Provider Integration & Security Hardening Suite', () => {
  const savedEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_HOST: process.env.EMAIL_HOST,
    EMAIL_PORT: process.env.EMAIL_PORT,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
  };

  const origCreateResendClient = mailer.createResendClient;
  const origNodemailerCreateTransport = nodemailer.createTransport;
  const origUserFindOne = User.findOne;

  let resendCalls = [];
  let smtpCalls = [];
  let mockResendBehavior = null;
  let mockSmtpBehavior = null;
  let mockUserDoc = null;

  beforeEach(() => {
    resendCalls = [];
    smtpCalls = [];
    mockResendBehavior = null;
    mockSmtpBehavior = null;

    // Set both Resend and existing Gmail SMTP env vars just like production Render
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_mock_key_999999';
    process.env.EMAIL_FROM = 'BrainDetour <no-reply@mail.braindetours.com>';
    process.env.EMAIL_HOST = 'smtp.gmail.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'existing.gmail.account@gmail.com';
    process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';

    mockUserDoc = {
      _id: '507f1f77bcf86cd799439099',
      email: 'scholar@braindetours.com',
      passwordResetOtpHash: null,
      passwordResetOtpExpiresAt: null,
      passwordResetPurpose: null,
      passwordResetAttempts: 0,
      passwordResetLastSentAt: null,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      saveCount: 0,
      async save() {
        this.saveCount += 1;
        return this;
      },
    };

    User.findOne = async ({ email }) => {
      if (email === mockUserDoc.email) {
        return mockUserDoc;
      }
      return null;
    };

    mailer.createResendClient = (apiKey) => ({
      apiKey,
      emails: {
        send: async (payload) => {
          resendCalls.push({ apiKey, payload });
          if (typeof mockResendBehavior === 'function') {
            return await mockResendBehavior(payload);
          }
          return { data: { id: 'resend-msg-id-12345' }, error: null };
        },
      },
    });

    nodemailer.createTransport = (transportConfig) => {
      smtpCalls.push({ stage: 'createTransport', transportConfig });
      return {
        verify: async () => true,
        sendMail: async (mailOptions) => {
          smtpCalls.push({ stage: 'sendMail', mailOptions });
          if (typeof mockSmtpBehavior === 'function') {
            return await mockSmtpBehavior(mailOptions);
          }
          return { messageId: '<smtp-msg-id@gmail.com>' };
        },
      };
    };
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    mailer.createResendClient = origCreateResendClient;
    nodemailer.createTransport = origNodemailerCreateTransport;
    User.findOne = origUserFindOne;
  });

  test('1. Successful Resend delivery with exact sender, recipient, and BrainDetour 60s OTP content; never invokes SMTP', async () => {
    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.expiresInSeconds, 60);
    assert.ok(res.body.otpExpiresAt);

    // Verify Resend was called once and SMTP was NEVER called
    assert.strictEqual(resendCalls.length, 1);
    assert.strictEqual(smtpCalls.length, 0, 'Resend mode must never invoke Nodemailer/SMTP');

    const { apiKey, payload } = resendCalls[0];
    assert.strictEqual(apiKey, 're_test_mock_key_999999');
    assert.strictEqual(payload.from, 'BrainDetour <no-reply@mail.braindetours.com>');
    assert.strictEqual(payload.to, 'scholar@braindetours.com');
    assert.strictEqual(payload.subject, 'BrainDetour — Password Reset Verification Code');
    assert.ok(payload.text.includes('60 seconds'), 'Text body must state 60 seconds validity');
    assert.ok(payload.html.includes('BrainDetour Password Reset'), 'HTML body must preserve BrainDetour branding');

    // Extract 6-digit OTP from sent payload and verify it matches stored hash in DB
    const otpMatch = payload.text.match(/\b(\d{6})\b/);
    assert.ok(otpMatch, 'Payload must contain a 6-digit OTP');
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, hashToken(otpMatch[1]));
    assert.strictEqual(mockUserDoc.passwordResetPurpose, 'password-reset');

    // Verify existing Gmail credentials remain untouched in process.env
    assert.strictEqual(process.env.EMAIL_USER, 'existing.gmail.account@gmail.com');
    assert.strictEqual(process.env.EMAIL_PASS, 'abcd efgh ijkl mnop');
  });

  test('2. Missing RESEND_API_KEY in Resend mode fails safely with HTTP 500, cleans up OTP, and never falls back to SMTP', async () => {
    process.env.RESEND_API_KEY = '';

    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.provider, 'resend');
    assert.strictEqual(res.body.error.code, 'EMAIL_NOT_CONFIGURED');
    assert.strictEqual(res.body.error.category, 'EMAIL_CONFIG_ERROR');

    assert.strictEqual(resendCalls.length, 0);
    assert.strictEqual(smtpCalls.length, 0, 'Must never fall back to SMTP when RESEND_API_KEY is missing');
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
    assert.strictEqual(mockUserDoc.passwordResetOtpExpiresAt, null);
    assert.strictEqual(mockUserDoc.passwordResetLastSentAt, null);
  });

  test('3. Missing EMAIL_FROM in Resend mode fails safely and never substitutes EMAIL_USER as sender', async () => {
    process.env.EMAIL_FROM = '';

    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.provider, 'resend');
    assert.strictEqual(res.body.error.code, 'EMAIL_NOT_CONFIGURED');
    assert.strictEqual(res.body.error.category, 'EMAIL_CONFIG_ERROR');
    assert.strictEqual(resendCalls.length, 0, 'Must not send with EMAIL_USER when EMAIL_FROM is missing');
    assert.strictEqual(smtpCalls.length, 0);
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
  });

  test('4. Missing or invalid EMAIL_PROVIDER fails safely without invoking Resend or SMTP', async () => {
    // 4a. Missing EMAIL_PROVIDER
    delete process.env.EMAIL_PROVIDER;

    const missingRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(missingRes.status, 500);
    assert.strictEqual(missingRes.body.error.provider, 'unconfigured');
    assert.strictEqual(missingRes.body.error.code, 'EMAIL_PROVIDER_MISSING');
    assert.strictEqual(missingRes.body.error.category, 'EMAIL_CONFIG_ERROR');
    assert.strictEqual(resendCalls.length, 0);
    assert.strictEqual(smtpCalls.length, 0);
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);

    // 4b. Invalid EMAIL_PROVIDER
    process.env.EMAIL_PROVIDER = 'sendgrid';

    const invalidRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(invalidRes.status, 500);
    assert.strictEqual(invalidRes.body.error.provider, 'unconfigured');
    assert.strictEqual(invalidRes.body.error.code, 'INVALID_EMAIL_PROVIDER');
    assert.strictEqual(invalidRes.body.error.category, 'EMAIL_CONFIG_ERROR');
    assert.strictEqual(resendCalls.length, 0);
    assert.strictEqual(smtpCalls.length, 0);
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
  });

  test('5. Resend API rejection, network failure, timeout, and rate-limit error use provider-neutral EMAIL_* categories, clean up OTP, and never fall back to SMTP', async () => {
    // 5a. Resend API rejection (403 validation_error -> EMAIL_AUTH_ERROR)
    mockResendBehavior = async () => ({
      data: null,
      error: {
        name: 'validation_error',
        message: 'The domain mail.braindetours.com is not verified for key re_test_mock_key_999999',
        statusCode: 403,
      },
    });

    const apiFailRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(apiFailRes.status, 500);
    assert.strictEqual(apiFailRes.body.error.provider, 'resend');
    assert.strictEqual(apiFailRes.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(apiFailRes.body.error.category, 'EMAIL_AUTH_ERROR');
    assert.strictEqual(smtpCalls.length, 0, 'Must never fall back to SMTP on Resend API rejection');
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
    assert.strictEqual(mockUserDoc.passwordResetLastSentAt, null);

    // 5b. Network failure (Resend fetch resolution failure -> EMAIL_NETWORK_ERROR)
    mockResendBehavior = async () => ({
      data: null,
      error: {
        name: 'application_error',
        message: 'Unable to fetch data. The request could not be resolved.',
        statusCode: null,
      },
    });

    const netFailRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(netFailRes.status, 500);
    assert.strictEqual(netFailRes.body.error.provider, 'resend');
    assert.strictEqual(netFailRes.body.error.code, 'RESEND_NETWORK_ERROR');
    assert.strictEqual(netFailRes.body.error.category, 'EMAIL_NETWORK_ERROR');
    assert.strictEqual(smtpCalls.length, 0);
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);

    // 5c. Rate-limit error (429 rate_limit_exceeded -> EMAIL_RATE_LIMIT_ERROR)
    mockResendBehavior = async () => ({
      data: null,
      error: {
        name: 'rate_limit_exceeded',
        message: 'Too many requests. Please slow down.',
        statusCode: 429,
      },
    });

    const rateLimitRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(rateLimitRes.status, 500);
    assert.strictEqual(rateLimitRes.body.error.provider, 'resend');
    assert.strictEqual(rateLimitRes.body.error.code, 'RESEND_RATE_LIMIT');
    assert.strictEqual(rateLimitRes.body.error.category, 'EMAIL_RATE_LIMIT_ERROR');
    assert.strictEqual(smtpCalls.length, 0);
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);

    // 5d. Delivery error (422 unprocessable_entity -> EMAIL_DELIVERY_ERROR)
    mockResendBehavior = async () => ({
      data: null,
      error: {
        name: 'invalid_parameter',
        message: 'Invalid recipient format',
        statusCode: 422,
      },
    });

    const deliveryFailRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(deliveryFailRes.status, 500);
    assert.strictEqual(deliveryFailRes.body.error.provider, 'resend');
    assert.strictEqual(deliveryFailRes.body.error.code, 'INVALID_PARAMETER');
    assert.strictEqual(deliveryFailRes.body.error.category, 'EMAIL_DELIVERY_ERROR');
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
  });

  test('6. Safe targeted OTP cleanup never deletes a concurrent valid OTP or reset session', async () => {
    const newerConcurrentOtpHash = hashToken('654321');
    const newerExpiresAt = new Date(Date.now() + 60000);

    mockResendBehavior = async () => {
      // Simulate another concurrent request replacing passwordResetOtpHash while this email request is in flight
      mockUserDoc.passwordResetOtpHash = newerConcurrentOtpHash;
      mockUserDoc.passwordResetOtpExpiresAt = newerExpiresAt;
      throw new Error('Network socket hang up during Resend call');
    };

    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(
      mockUserDoc.passwordResetOtpHash,
      newerConcurrentOtpHash,
      'Targeted OTP cleanup must not delete a different active OTP'
    );
  });

  test('7. Existing Gmail SMTP mode (EMAIL_PROVIDER=smtp) works as before and never invokes Resend', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';

    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    assert.strictEqual(resendCalls.length, 0, 'SMTP mode must never invoke Resend');
    assert.strictEqual(smtpCalls.length, 2, 'SMTP mode must call createTransport and sendMail');
    assert.strictEqual(smtpCalls[0].transportConfig.auth.user, 'existing.gmail.account@gmail.com');
    assert.strictEqual(smtpCalls[0].transportConfig.auth.pass, 'abcdefghijklmnop');
    assert.strictEqual(smtpCalls[1].mailOptions.to, 'scholar@braindetours.com');

    // Also verify that if SMTP fails in EMAIL_PROVIDER=smtp mode, it reports provider: smtp and never calls Resend
    mockUserDoc.passwordResetLastSentAt = null;
    mockSmtpBehavior = async () => {
      const err = new Error('SMTP connection refused');
      err.code = 'ECONNECTION';
      throw err;
    };

    const failSmtpRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { Origin: 'https://braindetours.com' },
      body: { email: 'scholar@braindetours.com' },
    });

    assert.strictEqual(failSmtpRes.status, 500);
    assert.strictEqual(failSmtpRes.body.error.provider, 'smtp');
    assert.strictEqual(failSmtpRes.body.error.category, 'EMAIL_NETWORK_ERROR');
    assert.strictEqual(resendCalls.length, 0, 'Failed SMTP delivery must never fall back to Resend');
    assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
  });

  test('8. Resend startup verification returns configured: true and verified: false without sending a real email', async () => {
    process.env.EMAIL_PROVIDER = 'resend';

    const verifyResult = await mailer.verifyEmailTransport();
    assert.strictEqual(verifyResult.provider, 'resend');
    assert.strictEqual(verifyResult.configured, true);
    assert.strictEqual(
      verifyResult.verified,
      false,
      'Resend startup check must not claim verified: true merely from SDK client instantiation'
    );
    assert.strictEqual(verifyResult.verificationStatus, 'not_verified_at_startup');
    assert.strictEqual(verifyResult.from, undefined, 'Must not expose sender details in verification output');
    assert.strictEqual(resendCalls.length, 0, 'Startup verification must never send a real email');
  });

  test('9. Error sanitizers never blindly trust error.safeDiagnostic and redact API keys, passwords, DB URIs, emails, OTPs, tokens, and cookies', () => {
    const poisonedError = new Error('Raw error with key re_live_secretKey123456789');
    poisonedError.safeDiagnostic = {
      provider: 'resend',
      code: 'ERR_WITH_KEY_re_live_secretKey123456789',
      operation: 'SEND_FOR_scholar@braindetours.com',
      category: 'UNTRUSTED_CUSTOM_CATEGORY_re_live_secretKey123456789',
      message:
        'Failed with key re_live_secretKey123456789, pass abcd efgh ijkl mnop, db mongodb+srv://admin:supersecret@cluster0.mongodb.net/braindetour, email user@example.com, otp 482910, jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c, Cookie: accessToken=secretCookieVal; refreshToken=secretRefreshVal',
      leakedApiKey: 're_live_secretKey123456789',
      leakedPassword: 'abcd efgh ijkl mnop',
      leakedOtp: '482910',
    };

    const sanitizedMail = mailer.sanitizeMailError(poisonedError, 'RESEND_SEND');
    const sanitizedReset = sanitizeResetOperationError(poisonedError, 'FORGOT_PASSWORD');
    const sanitizedLog = sanitizeErrorForLog(poisonedError);

    for (const diag of [sanitizedMail, sanitizedReset, sanitizedLog]) {
      const serialized = JSON.stringify(diag);
      assert.ok(!serialized.includes('re_live_secretKey123456789'), 'Must redact Resend API key');
      assert.ok(!serialized.includes('abcd efgh ijkl mnop'), 'Must redact SMTP password');
      assert.ok(!serialized.includes('abcdefghijklmnop'), 'Must redact normalized SMTP password');
      assert.ok(!serialized.includes('supersecret@cluster0.mongodb.net'), 'Must redact MongoDB URI');
      assert.ok(!serialized.includes('user@example.com'), 'Must redact email addresses');
      assert.ok(!serialized.includes('scholar@braindetours.com'), 'Must redact email in operation');
      assert.ok(!serialized.includes('482910'), 'Must redact 6-digit OTP');
      assert.ok(!serialized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Must redact JWT reset/access tokens');
      assert.ok(!serialized.includes('secretCookieVal'), 'Must redact cookies');
      assert.strictEqual(diag.leakedApiKey, undefined, 'Must strip untrusted extra properties from safeDiagnostic');
      assert.strictEqual(diag.leakedPassword, undefined, 'Must strip untrusted password properties');
      assert.strictEqual(diag.leakedOtp, undefined, 'Must strip untrusted OTP properties');
    }
  });

  test('10. GET /api/health exposes only sanitized provider and configuration status without host, sender, or credentials', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    const resendHealth = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/health',
    });

    assert.deepStrictEqual(resendHealth.body.email, {
      provider: 'resend',
      configured: true,
    });
    assert.strictEqual(resendHealth.body.email.host, undefined);
    assert.strictEqual(resendHealth.body.email.port, undefined);
    assert.strictEqual(resendHealth.body.email.from, undefined);

    process.env.EMAIL_PROVIDER = 'smtp';
    const smtpHealth = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/health',
    });

    assert.deepStrictEqual(smtpHealth.body.email, {
      provider: 'smtp',
      configured: true,
    });
    assert.strictEqual(smtpHealth.body.email.host, undefined);
    assert.strictEqual(smtpHealth.body.email.port, undefined);
    assert.strictEqual(smtpHealth.body.email.from, undefined);
  });

  test('11. Mailer does not apply process-wide dns.setDefaultResultOrder and User schema validates OTP update fields cleanly', async () => {
    const mailerSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'utils', 'mailer.js'),
      'utf8'
    );
    assert.ok(
      !mailerSource.includes('setDefaultResultOrder'),
      'mailer.js must not modify process-wide DNS result order'
    );

    // Validate password-reset update fields against the Mongoose User model schema
    const tempUser = new User({
      name: 'Schema Check Scholar',
      email: 'schemacheck@braindetours.com',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv1234567890abcdefghijklmnopqrstuv',
      passwordResetOtpHash: hashToken('123456'),
      passwordResetOtpExpiresAt: new Date(Date.now() + 60000),
      passwordResetPurpose: 'password-reset',
      passwordResetAttempts: 0,
      passwordResetLastSentAt: new Date(),
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    });

    await tempUser.validate();
  });

  test('12. redactSensitiveText redacts sensitive key/value pairs in quoted, unquoted, and JSON-style formats', () => {
    const cases = [
      {
        input: 'Auth payload failed with password: "secret"',
        forbidden: 'secret',
        expectedSubstring: 'password=[REDACTED]',
      },
      {
        input: 'JSON payload {"refreshToken": "secret"} rejected',
        forbidden: 'secret',
        expectedSubstring: 'refreshToken=[REDACTED]',
      },
      {
        input: "Query string had resetToken='secret' in URL",
        forbidden: 'secret',
        expectedSubstring: 'resetToken=[REDACTED]',
      },
      {
        input: 'Header config apiKey: "secret" failed',
        forbidden: 'secret',
        expectedSubstring: 'apiKey=[REDACTED]',
      },
      {
        input: 'Unquoted accessToken=my_unquoted_secret and "api_key": \'single_quoted_secret\'',
        forbidden: 'my_unquoted_secret',
        expectedSubstring: 'accessToken=[REDACTED]',
      },
    ];

    for (const { input, forbidden, expectedSubstring } of cases) {
      const output = mailer.redactSensitiveText(input);
      assert.ok(
        !output.includes(forbidden),
        `Expected "${forbidden}" to be redacted from: ${input} (got: ${output})`
      );
      assert.ok(
        output.includes(expectedSubstring),
        `Expected "${expectedSubstring}" in output: ${output}`
      );
    }
  });
});
