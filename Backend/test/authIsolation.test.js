const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Topic = require('../src/models/Topic');
const LearningSession = require('../src/models/LearningSession');
const SpeechSession = require('../src/models/SpeechSession');
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} = require('../src/utils/tokens');

let mongod;
let server;
let baseUrl;

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  update(res) {
    const rawHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);

    for (const cookieStr of rawHeaders) {
      const [nameValue, ...directives] = cookieStr.split(';');
      const [name, ...valParts] = nameValue.split('=');
      const key = name.trim();
      const val = valParts.join('=').trim();

      const isCleared = directives.some((d) => {
        const lower = d.trim().toLowerCase();
        return lower === 'max-age=0' || lower.includes('expires=thu, 01 jan 1970');
      });

      if (isCleared || val === '') {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, val);
      }
    }
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  set(name, value) {
    this.cookies.set(name, value);
  }

  get(name) {
    return this.cookies.get(name);
  }

  clear() {
    this.cookies.clear();
  }
}

async function jarFetch(jar, urlPath, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookieHeader = jar.getCookieHeader();
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }
  const url = `${baseUrl}${urlPath}`;
  const res = await fetch(url, { ...options, headers });
  jar.update(res);
  return res;
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_minimum_32_characters';
  process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_minimum_32_characters';
  process.env.JWT_SECRET = 'test_access_token_secret_minimum_32_characters';

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

describe('Phase 4: Authentication Session Isolation Suite', () => {
  const userA = {
    name: 'Scholar User Alpha',
    email: 'user_alpha@braindetour.local',
    password: 'PasswordAlpha123!',
  };

  const userB = {
    name: 'Scholar User Beta',
    email: 'user_beta@braindetour.local',
    password: 'PasswordBeta123!',
  };

  const jarA = new CookieJar();
  const jarB = new CookieJar();
  let createdTopic;

  test('Setup active topic for learning and speech tests', async () => {
    createdTopic = await Topic.create({
      title: 'Quantum Computing and Superposition',
      slug: 'quantum-computing-superposition',
      category: 'Science',
      summary: 'An exploration of qubit states and interference.',
      keyQuestions: ['How do qubits differ from classical bits?'],
      isActive: true,
    });
    assert.ok(createdTopic._id);
  });

  // 1. Fresh browser without cookies receives unauthenticated response
  test('1. Fresh browser without cookies receives unauthenticated response with anti-cache headers', async () => {
    const freshJar = new CookieJar();
    const res = await jarFetch(freshJar, '/api/auth/me');
    assert.strictEqual(res.status, 401);

    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, 'Authentication required. Please log in.');

    // Verify anti-caching headers on unauthenticated 401
    const cacheControl = res.headers.get('cache-control') || '';
    assert.ok(cacheControl.includes('no-store'), 'Expected Cache-Control to include no-store');
    assert.ok(cacheControl.includes('private'), 'Expected Cache-Control to include private');
    assert.strictEqual(res.headers.get('pragma'), 'no-cache');
  });

  // 2. User A can register
  test('2. User A can register and receives isolated cookies', async () => {
    const res = await jarFetch(jarA, '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.email, userA.email);

    assert.ok(jarA.get('accessToken'), 'User A must have accessToken cookie');
    assert.ok(jarA.get('refreshToken'), 'User A must have refreshToken cookie');
  });

  // 3. User A can log in
  test('3. User A can log in successfully', async () => {
    jarA.clear();
    const res = await jarFetch(jarA, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: userA.password }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.email, userA.email);
    assert.ok(jarA.get('accessToken'));
  });

  // 4. User A remains authenticated after page reload/session verification
  test('4. User A remains authenticated after page reload / GET /api/auth/me', async () => {
    const res = await jarFetch(jarA, '/api/auth/me');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.email, userA.email);
    assert.strictEqual(body.user.name, userA.name);

    // Verify anti-cache headers on authenticated 200
    const cacheControl = res.headers.get('cache-control') || '';
    assert.ok(cacheControl.includes('no-store'));
    assert.ok(cacheControl.includes('private'));
    assert.strictEqual(res.headers.get('pragma'), 'no-cache');
    assert.strictEqual(res.headers.get('expires'), '0');
  });

  // 5. User A can log out
  test('5. User A can log out and cookies are cleared', async () => {
    const res = await jarFetch(jarA, '/api/auth/logout', { method: 'POST' });
    assert.strictEqual(res.status, 200);

    // Verify cookie jar cleared
    assert.strictEqual(jarA.get('accessToken'), undefined);
    assert.strictEqual(jarA.get('refreshToken'), undefined);

    // Next request returns 401
    const meRes = await jarFetch(jarA, '/api/auth/me');
    assert.strictEqual(meRes.status, 401);
  });

  // 6. User B initially receives unauthenticated response
  test('6. User B initially receives unauthenticated response in independent jar', async () => {
    const res = await jarFetch(jarB, '/api/auth/me');
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // 7. User B can register independently
  test('7. User B can register independently', async () => {
    const res = await jarFetch(jarB, '/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.user.email, userB.email);
    assert.ok(jarB.get('accessToken'));
    assert.ok(jarB.get('refreshToken'));
  });

  // 8. User B remains authenticated after reload
  test('8. User B remains authenticated after reload in jar B', async () => {
    const res = await jarFetch(jarB, '/api/auth/me');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.user.email, userB.email);
    assert.strictEqual(body.user.name, userB.name);
  });

  // 9. User A never receives User B's profile
  test('9. User A never receives User B profile after User A logs back in', async () => {
    // Log User A back in
    const loginRes = await jarFetch(jarA, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: userA.password }),
    });
    assert.strictEqual(loginRes.status, 200);

    const meResA = await jarFetch(jarA, '/api/auth/me');
    const bodyA = await meResA.json();
    assert.strictEqual(bodyA.user.email, userA.email);
    assert.notStrictEqual(bodyA.user.email, userB.email);
    assert.notStrictEqual(bodyA.user.name, userB.name);
  });

  // 10. User B never receives User A's profile
  test('10. User B never receives User A profile', async () => {
    const meResB = await jarFetch(jarB, '/api/auth/me');
    const bodyB = await meResB.json();
    assert.strictEqual(bodyB.user.email, userB.email);
    assert.notStrictEqual(bodyB.user.email, userA.email);
    assert.notStrictEqual(bodyB.user.name, userA.name);
  });

  // 11. An expired access token with a valid refresh token works
  test('11. An expired access token with a valid refresh token can be refreshed successfully', async () => {
    // Manually forge an expired access token for User A
    const userDoc = await User.findOne({ email: userA.email });
    const expiredAccessToken = jwt.sign(
      { userId: userDoc._id.toString(), tokenType: 'access' },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '-1s' }
    );

    // Set the expired token into Jar A, keeping existing valid refresh token
    jarA.set('accessToken', expiredAccessToken);

    // Request to /api/auth/me fails with 401
    const expiredRes = await jarFetch(jarA, '/api/auth/me');
    assert.strictEqual(expiredRes.status, 401);
    const expiredBody = await expiredRes.json();
    assert.strictEqual(expiredBody.isExpired, true);

    // Refresh using the valid refreshToken
    const refreshRes = await jarFetch(jarA, '/api/auth/refresh', { method: 'POST' });
    assert.strictEqual(refreshRes.status, 200);
    const refreshBody = await refreshRes.json();
    assert.strictEqual(refreshBody.success, true);
    assert.strictEqual(refreshBody.user.email, userA.email);

    // After refresh, /api/auth/me succeeds with newly issued access token
    const verifyRes = await jarFetch(jarA, '/api/auth/me');
    assert.strictEqual(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.strictEqual(verifyBody.user.email, userA.email);
  });

  // 12. An invalid refresh token is rejected
  test('12. An invalid refresh token is rejected with 401', async () => {
    const invalidJar = new CookieJar();
    invalidJar.set('refreshToken', 'invalid.token.signature_here');

    const res = await jarFetch(invalidJar, '/api/auth/refresh', { method: 'POST' });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // 13. A failed refresh clears the authentication state
  test('13. A failed refresh clears authentication cookies', async () => {
    const badJar = new CookieJar();
    badJar.set('refreshToken', 'malformed_token_string');

    const res = await jarFetch(badJar, '/api/auth/refresh', { method: 'POST' });
    assert.strictEqual(res.status, 401);

    // Verify cookies were cleared in response
    assert.strictEqual(badJar.get('refreshToken'), undefined);
    assert.strictEqual(badJar.get('accessToken'), undefined);
  });

  // 14. Protected endpoints reject requests without authentication
  test('14. Protected learning and speech endpoints reject unauthenticated requests with 401', async () => {
    const unauthJar = new CookieJar();

    const learningRes = await jarFetch(unauthJar, '/api/learning/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: createdTopic._id.toString() }),
    });
    assert.strictEqual(learningRes.status, 401);

    const speechRes = await jarFetch(unauthJar, '/api/speech/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: createdTopic._id.toString(), durationMinutes: 5 }),
    });
    assert.strictEqual(speechRes.status, 401);
  });

  // 15. User B cannot access User A's learning session
  test("15. User B cannot access User A's learning session (isolated data)", async () => {
    // User A creates learning session
    const createRes = await jarFetch(jarA, '/api/learning/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: createdTopic._id.toString() }),
    });
    assert.strictEqual(createRes.status, 201);
    const sessionData = await createRes.json();
    const sessionIdA = sessionData.session._id;

    // User A can access their own session
    const getResA = await jarFetch(jarA, `/api/learning/sessions/${sessionIdA}`);
    assert.strictEqual(getResA.status, 200);

    // User B attempts to access User A's session -> must be rejected (404/403)
    const getResB = await jarFetch(jarB, `/api/learning/sessions/${sessionIdA}`);
    assert.strictEqual(getResB.status, 404);
  });

  // 16. User B cannot access User A's speech session
  test("16. User B cannot access User A's speech session (isolated data)", async () => {
    // User A creates speech session
    const createRes = await jarFetch(jarA, '/api/speech/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicId: createdTopic._id.toString(),
        durationMinutes: 5,
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const sessionData = await createRes.json();
    const speechSessionIdA = sessionData.session._id;

    // User A can access their own session
    const getResA = await jarFetch(jarA, `/api/speech/sessions/${speechSessionIdA}`);
    assert.strictEqual(getResA.status, 200);

    // User B attempts to access User A's session -> must be rejected (404/403)
    const getResB = await jarFetch(jarB, `/api/speech/sessions/${speechSessionIdA}`);
    assert.strictEqual(getResB.status, 404);
  });

  // 17. Logout in User A's cookie jar does not log out User B
  test("17. Logout in User A's cookie jar does not log out User B", async () => {
    // User A logs out
    const logoutRes = await jarFetch(jarA, '/api/auth/logout', { method: 'POST' });
    assert.strictEqual(logoutRes.status, 200);

    // User A is now unauthenticated
    const meResA = await jarFetch(jarA, '/api/auth/me');
    assert.strictEqual(meResA.status, 401);

    // User B remains fully authenticated
    const meResB = await jarFetch(jarB, '/api/auth/me');
    assert.strictEqual(meResB.status, 200);
    const bodyB = await meResB.json();
    assert.strictEqual(bodyB.user.email, userB.email);
  });

  // 18. Concurrency Investigation A: In-tab queued refresh (Simulating Axios Interceptor Mutex)
  test('18. Concurrency A: Multiple concurrent requests within one tab share single refresh', async () => {
    // Ensure User B has expired access token
    const userDocB = await User.findOne({ email: userB.email });
    const expiredTokenB = jwt.sign(
      { userId: userDocB._id.toString(), tokenType: 'access' },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '-1s' }
    );
    jarB.set('accessToken', expiredTokenB);

    // Simulate Axios mutex: exactly 1 refresh is triggered for multiple requests
    const refreshPromise = jarFetch(jarB, '/api/auth/refresh', { method: 'POST' });

    // Concurrent callers await the shared refreshPromise
    const [res1, res2] = await Promise.all([
      refreshPromise.then(() => jarFetch(jarB, '/api/auth/me')),
      refreshPromise.then(() => jarFetch(jarB, '/api/auth/me')),
    ]);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    const b1 = await res1.json();
    const b2 = await res2.json();
    assert.strictEqual(b1.user.email, userB.email);
    assert.strictEqual(b2.user.email, userB.email);
  });

  // 19. Concurrency Investigation B: Two independent tabs dispatching simultaneous refresh
  test('19. Concurrency B: Two simultaneous uncoordinated refresh calls with same token trigger reuse detection', async () => {
    // Log user A back in to get a fresh refresh token
    await jarFetch(jarA, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: userA.password }),
    });

    const sharedRefreshToken = jarA.get('refreshToken');
    assert.ok(sharedRefreshToken);

    // Create Tab 1 and Tab 2 with identical refresh token
    const tab1Jar = new CookieJar();
    tab1Jar.set('refreshToken', sharedRefreshToken);

    const tab2Jar = new CookieJar();
    tab2Jar.set('refreshToken', sharedRefreshToken);

    // Fire both refresh calls at the exact same millisecond
    const [tab1Res, tab2Res] = await Promise.all([
      jarFetch(tab1Jar, '/api/auth/refresh', { method: 'POST' }),
      jarFetch(tab2Jar, '/api/auth/refresh', { method: 'POST' }),
    ]);

    const statuses = [tab1Res.status, tab2Res.status].sort();
    // One must succeed (200) and one must be rejected (401) due to single-use rotation reuse detection
    assert.strictEqual(statuses[0], 200, 'First request to arrive must succeed with 200');
    assert.strictEqual(statuses[1], 401, 'Second request must be detected as reuse and return 401');

    // And verify the 401 response contains reuse detection message
    const rejectedRes = tab1Res.status === 401 ? tab1Res : tab2Res;
    const rejectedBody = await rejectedRes.json();
    assert.ok(
      rejectedBody.message.includes('already been used') || rejectedBody.message.includes('invalidated'),
      `Expected reuse detection message, got: ${rejectedBody.message}`
    );
  });
});
