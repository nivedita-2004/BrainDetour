const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Duplex } = require('node:stream');

process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_SECRET = 'cors-test-access-secret-key-2026';
process.env.REFRESH_TOKEN_SECRET = 'cors-test-refresh-secret-key-2026';

const app = require('../src/app');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/tokens');

/**
 * Dispatches an HTTP request through the full Express app middleware and routing pipeline
 * using Node's native http.IncomingMessage and http.ServerResponse.
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
        // Keep raw string if not JSON
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
        rawBody,
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

describe('Production & Development CORS Origin Normalization & Security Suite', () => {
  const originalClientOrigin = process.env.CLIENT_ORIGIN;
  const originalFindById = User.findById;
  const originalFindOne = User.findOne;

  beforeEach(() => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';
    process.env.EMAIL_PROVIDER = 'smtp';
  });

  afterEach(() => {
    if (originalClientOrigin === undefined) {
      delete process.env.CLIENT_ORIGIN;
    } else {
      process.env.CLIENT_ORIGIN = originalClientOrigin;
    }
    User.findById = originalFindById;
    User.findOne = originalFindOne;
  });

  test('1. normalizeOrigin strips trailing slashes and whitespace accurately', () => {
    assert.strictEqual(app.normalizeOrigin('https://braindetour.vercel.app/'), 'https://braindetour.vercel.app');
    assert.strictEqual(app.normalizeOrigin('https://braindetour.vercel.app///'), 'https://braindetour.vercel.app');
    assert.strictEqual(app.normalizeOrigin('  https://braindetour.vercel.app/  '), 'https://braindetour.vercel.app');
    assert.strictEqual(app.normalizeOrigin('http://localhost:5173/'), 'http://localhost:5173');
    assert.strictEqual(app.normalizeOrigin(''), '');
    assert.strictEqual(app.normalizeOrigin(undefined), '');
  });

  test('2. Production origin without trailing slash matches when CLIENT_ORIGIN is configured with trailing slash', async () => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/health',
      headers: {
        Origin: 'https://braindetour.vercel.app',
      },
    });

    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://braindetour.vercel.app');
    assert.notStrictEqual(res.headers['access-control-allow-origin'], 'https://braindetour.vercel.app/');
    assert.notStrictEqual(res.headers['access-control-allow-origin'], '*');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  test('3. Configured custom origin with trailing slash is normalized and returned without trailing slash', async () => {
    process.env.CLIENT_ORIGIN = 'https://staging.braindetour.vercel.app///, https://braindetour.vercel.app/';

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/health',
      headers: {
        Origin: 'https://staging.braindetour.vercel.app',
      },
    });

    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://staging.braindetour.vercel.app');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  test('4. Localhost frontend origin (http://localhost:5173) remains allowed alongside production origin', async () => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/health',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  test('5. OPTIONS preflight for POST /api/auth/forgot-password succeeds with exact normalized origin and credentials', async () => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';

    const res = await dispatchRequest(app, {
      method: 'OPTIONS',
      url: '/api/auth/forgot-password',
      headers: {
        Origin: 'https://braindetour.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Requested-With',
      },
    });

    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://braindetour.vercel.app');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
    assert.ok(res.headers['access-control-allow-methods'].includes('POST'));
    assert.ok(res.headers['access-control-allow-methods'].includes('OPTIONS'));
    assert.ok(res.headers['access-control-allow-headers'].includes('Content-Type'));
    assert.ok(res.headers['access-control-allow-headers'].includes('Authorization'));
  });

  test('6. Credentialed GET /api/auth/me request from production origin succeeds with HTTP-only cookie and CORS headers', async () => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';
    const mockUserId = '507f1f77bcf86cd799439011';

    User.findById = async (id) => {
      if (String(id) === mockUserId) {
        return {
          _id: mockUserId,
          name: 'Production Scholar',
          email: 'scholar@braindetour.com',
          toSafeObject() {
            return {
              id: mockUserId,
              name: this.name,
              email: this.email,
            };
          },
        };
      }
      return null;
    };

    const accessToken = generateAccessToken(mockUserId);

    const res = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        Origin: 'https://braindetour.vercel.app',
        Cookie: `accessToken=${accessToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.user.email, 'scholar@braindetour.com');
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://braindetour.vercel.app');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  test('7. Credentialed POST /api/auth/forgot-password request from production origin returns exact CORS headers', async () => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';

    User.findOne = async () => null;

    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: {
        Origin: 'https://braindetour.vercel.app',
      },
      body: {
        email: 'scholar@braindetour.com',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://braindetour.vercel.app');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  test('8. Unauthorized origin is rejected on both OPTIONS preflight and POST requests without CORS allow headers', async () => {
    process.env.CLIENT_ORIGIN = 'https://braindetour.vercel.app/';

    const preflightRes = await dispatchRequest(app, {
      method: 'OPTIONS',
      url: '/api/auth/forgot-password',
      headers: {
        Origin: 'https://malicious-attacker.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.strictEqual(preflightRes.status, 403);
    assert.strictEqual(preflightRes.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(preflightRes.headers['access-control-allow-credentials'], undefined);

    const postRes = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: {
        Origin: 'https://malicious-attacker.example.com',
      },
      body: {
        email: 'scholar@braindetour.com',
      },
    });

    assert.strictEqual(postRes.status, 403);
    assert.strictEqual(postRes.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(postRes.headers['access-control-allow-credentials'], undefined);
  });

  test('9. Unauthenticated 401 on /api/auth/me and /api/auth/refresh does not prevent public /api/auth/forgot-password OTP delivery', async () => {
    const nodemailer = require('nodemailer');
    const origCreateTransport = nodemailer.createTransport;
    const prevUser = process.env.EMAIL_USER;
    const prevPass = process.env.EMAIL_PASS;

    let sentMailOptions = null;
    nodemailer.createTransport = () => ({
      verify: async () => true,
      sendMail: async (opts) => {
        sentMailOptions = opts;
        return { messageId: '<test-otp@braindetour.app>' };
      },
    });

    try {
      process.env.EMAIL_USER = 'mailer@gmail.com';
      process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';

      // Step 1: Unauthenticated visitor hits GET /api/auth/me -> 401
      const meRes = await dispatchRequest(app, {
        method: 'GET',
        url: '/api/auth/me',
        headers: { Origin: 'https://braindetour.vercel.app' },
      });
      assert.strictEqual(meRes.status, 401);

      // Step 2: Unauthenticated visitor hits POST /api/auth/refresh -> 401
      const refreshRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { Origin: 'https://braindetour.vercel.app' },
      });
      assert.strictEqual(refreshRes.status, 401);

      // Step 3: Unauthenticated visitor submits POST /api/auth/forgot-password -> 200 OK + OTP sent
      let savedWithOptions = null;
      const mockUserDoc = {
        _id: '507f1f77bcf86cd799439022',
        email: 'scholar@braindetour.com',
        passwordResetLastSentAt: null,
        async save(options) {
          savedWithOptions = options;
          return this;
        },
      };
      User.findOne = async () => mockUserDoc;

      const forgotRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/forgot-password',
        headers: {
          Origin: 'https://braindetour.vercel.app',
          'X-Forwarded-For': '203.0.113.42',
        },
        body: { email: 'scholar@braindetour.com' },
      });

      assert.strictEqual(forgotRes.status, 200);
      assert.strictEqual(forgotRes.body.success, true);
      assert.strictEqual(forgotRes.body.expiresInSeconds, 60);
      assert.ok(forgotRes.body.otpExpiresAt);
      assert.ok(sentMailOptions, 'OTP email must be dispatched');
      assert.strictEqual(sentMailOptions.to, 'scholar@braindetour.com');
      assert.strictEqual(savedWithOptions, undefined, 'Must not disable Mongoose validation');
    } finally {
      nodemailer.createTransport = origCreateTransport;
      process.env.EMAIL_USER = prevUser;
      process.env.EMAIL_PASS = prevPass;
    }
  });

  test('10. Sanitized production diagnostics categorize EMAIL_NOT_CONFIGURED, EAUTH, and ETIMEDOUT without leaking secrets', async () => {
    const nodemailer = require('nodemailer');
    const origCreateTransport = nodemailer.createTransport;
    const prevUser = process.env.EMAIL_USER;
    const prevPass = process.env.EMAIL_PASS;
    const prevEnforce = process.env.ENFORCE_EMAIL_CONFIG_IN_TEST;

    const mockUserDoc = {
      _id: '507f1f77bcf86cd799439033',
      email: 'scholar@braindetour.com',
      passwordResetLastSentAt: null,
      passwordResetOtpHash: null,
      passwordResetOtpExpiresAt: null,
      passwordResetPurpose: null,
      passwordResetAttempts: 0,
      async save() {
        return this;
      },
    };
    User.findOne = async () => mockUserDoc;

    try {
      // Case A: Missing Render EMAIL_USER / EMAIL_PASS -> EMAIL_NOT_CONFIGURED / SMTP_CONFIG_ERROR
      process.env.ENFORCE_EMAIL_CONFIG_IN_TEST = 'true';
      process.env.EMAIL_USER = '';
      process.env.EMAIL_PASS = '';

      const unconfiguredRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/forgot-password',
        headers: { Origin: 'https://braindetour.vercel.app' },
        body: { email: 'scholar@braindetour.com' },
      });

      assert.strictEqual(unconfiguredRes.status, 500);
      assert.strictEqual(unconfiguredRes.body.success, false);
      assert.strictEqual(
        unconfiguredRes.body.message,
        'Failed to send verification email. Please try again later.'
      );
      assert.strictEqual(unconfiguredRes.body.error.provider, 'smtp');
      assert.strictEqual(unconfiguredRes.body.error.code, 'EMAIL_NOT_CONFIGURED');
      assert.strictEqual(unconfiguredRes.body.error.operation, 'CREATE_TRANSPORTER');
      assert.strictEqual(unconfiguredRes.body.error.category, 'EMAIL_CONFIG_ERROR');
      assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);

      // Case B: Render outbound SMTP timeout (ETIMEDOUT) -> EMAIL_TIMEOUT_ERROR
      process.env.EMAIL_USER = 'mailer@gmail.com';
      process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
      nodemailer.createTransport = () => ({
        sendMail: async () => {
          const err = new Error('Connection timeout connecting to smtp.gmail.com:587 for scholar@braindetour.com');
          err.code = 'ETIMEDOUT';
          err.command = 'CONN';
          throw err;
        },
      });

      const timeoutRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/forgot-password',
        headers: { Origin: 'https://braindetour.vercel.app' },
        body: { email: 'scholar@braindetour.com' },
      });

      assert.strictEqual(timeoutRes.status, 500);
      assert.strictEqual(timeoutRes.body.error.provider, 'smtp');
      assert.strictEqual(timeoutRes.body.error.code, 'ETIMEDOUT');
      assert.strictEqual(timeoutRes.body.error.operation, 'CONN');
      assert.strictEqual(timeoutRes.body.error.category, 'EMAIL_TIMEOUT_ERROR');
      assert.strictEqual(mockUserDoc.passwordResetOtpHash, null);
    } finally {
      nodemailer.createTransport = origCreateTransport;
      process.env.EMAIL_USER = prevUser;
      process.env.EMAIL_PASS = prevPass;
      if (prevEnforce === undefined) {
        delete process.env.ENFORCE_EMAIL_CONFIG_IN_TEST;
      } else {
        process.env.ENFORCE_EMAIL_CONFIG_IN_TEST = prevEnforce;
      }
    }
  });
});
