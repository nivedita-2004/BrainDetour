const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Topic = require('../src/models/Topic');
const LearningSession = require('../src/models/LearningSession');
const { generateAccessToken } = require('../src/utils/tokens');

let mongod;
let server;
let baseUrl;

let user1;
let user2;
let user1Token;
let user2Token;
let activeTopic;
let inactiveTopic;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_minimum_16_chars';
  process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_minimum_16_chars';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Create two distinct users for isolation testing
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);

  user1 = await User.create({
    name: 'Explorer One',
    email: 'user1@braindetour.com',
    passwordHash,
  });

  user2 = await User.create({
    name: 'Explorer Two',
    email: 'user2@braindetour.com',
    passwordHash,
  });

  user1Token = generateAccessToken(user1._id);
  user2Token = generateAccessToken(user2._id);

  // Create an active topic and an inactive topic
  activeTopic = await Topic.create({
    title: 'Cognitive Biases in AI Model Interpretation',
    slug: 'cognitive-biases-ai',
    category: 'Psychology',
    description: 'Investigating automation and confirmation bias in machine learning evaluation.',
    isActive: true,
  });

  inactiveTopic = await Topic.create({
    title: 'Archived Draft Topic',
    slug: 'archived-draft-topic',
    category: 'History',
    description: 'Archived topic not available for new learning sessions.',
    isActive: false,
  });

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

describe('BrainDetour Learning History & Reflections API', () => {
  let user1SessionId;

  test('1. An unauthenticated request cannot access learning history (401)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/history`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  test('2. An authenticated user can start a learning session (201)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString() }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.session._id);
    assert.strictEqual(data.session.status, 'in_progress');
    assert.strictEqual(data.session.topic.title, activeTopic.title);
    assert.ok(data.session.startedAt);
    assert.strictEqual(data.session.completedAt, null);

    user1SessionId = data.session._id;
  });

  test('3. Starting a session with an invalid topic ID fails cleanly (400)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: 'invalid-mongodb-id-123' }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Invalid topicId format'));
  });

  test('4. Starting a session for a missing or inactive topic fails (404)', async () => {
    // Missing topic
    const missingId = new mongoose.Types.ObjectId().toString();
    const missingRes = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: missingId }),
    });
    assert.strictEqual(missingRes.status, 404);

    // Inactive topic
    const inactiveRes = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: inactiveTopic._id.toString() }),
    });
    assert.strictEqual(inactiveRes.status, 404);
    const inactiveData = await inactiveRes.json();
    assert.ok(inactiveData.message.includes('Topic not found or inactive'));
  });

  test('5. A user can retrieve their own learning history (200)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/history?page=1&limit=10`, {
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.sessions.length >= 1);
    assert.strictEqual(data.pagination.page, 1);
    assert.strictEqual(data.pagination.limit, 10);
    assert.strictEqual(data.sessions[0]._id, user1SessionId);
    assert.ok(data.sessions[0].topic.slug);
  });

  test('6. One user’s history does not include another user’s sessions', async () => {
    // User 2 has not started any sessions yet
    const res = await fetch(`${baseUrl}/api/learning/history`, {
      headers: {
        Cookie: `accessToken=${user2Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.count, 0);
    assert.deepStrictEqual(data.sessions, []);
  });

  test('7. A user can retrieve their own session (200)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}`, {
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session._id, user1SessionId);
    assert.strictEqual(data.session.topic.title, activeTopic.title);
  });

  test('8. A user cannot retrieve another user’s session (404)', async () => {
    // User 2 attempts to fetch User 1's session
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}`, {
      headers: {
        Cookie: `accessToken=${user2Token}`,
      },
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'Learning session not found');
  });

  test('9. A user can save a partial reflection', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({
        whatILearned: 'I learned that human automation bias causes over-reliance on AI.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(
      data.session.reflection.whatILearned,
      'I learned that human automation bias causes over-reliance on AI.'
    );
    assert.strictEqual(data.session.reflection.whatSurprisedMe, '');
  });

  test('10. Updating one reflection field does not erase other fields', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({
        whatSurprisedMe: 'Clinicians sometimes ignore physical cues in favor of model output.',
        myOpinion: 'Double-blind auditing protocols are essential.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    // Previously saved field must still be intact
    assert.strictEqual(
      data.session.reflection.whatILearned,
      'I learned that human automation bias causes over-reliance on AI.'
    );
    assert.strictEqual(
      data.session.reflection.whatSurprisedMe,
      'Clinicians sometimes ignore physical cues in favor of model output.'
    );
    assert.strictEqual(
      data.session.reflection.myOpinion,
      'Double-blind auditing protocols are essential.'
    );
    assert.strictEqual(data.session.reflection.questionsRemaining, '');
  });

  test('11. Invalid reflection fields and oversized text are rejected with 400', async () => {
    // Unexpected field
    const unexpectedRes = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({
        maliciousKey: 'hack',
      }),
    });
    assert.strictEqual(unexpectedRes.status, 400);

    // Non-string field
    const nonStringRes = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({
        whatILearned: 12345,
      }),
    });
    assert.strictEqual(nonStringRes.status, 400);

    // Oversized text (>5000 characters)
    const giantText = 'A'.repeat(5001);
    const oversizedRes = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({
        whatILearned: giantText,
      }),
    });
    assert.strictEqual(oversizedRes.status, 400);
  });

  test('12. A user cannot edit another user’s reflection (404)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/reflection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user2Token}`,
      },
      body: JSON.stringify({
        whatILearned: 'Hijacking another user reflection',
      }),
    });

    assert.strictEqual(res.status, 404);
  });

  test('13. Completing a session records completion timestamp and duration', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/complete`, {
      method: 'PATCH',
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session.status, 'completed');
    assert.ok(data.session.completedAt);
    assert.strictEqual(typeof data.session.durationSeconds, 'number');
    assert.ok(data.session.durationSeconds >= 0);
  });

  test('14. A user cannot complete another user’s session (404)', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/complete`, {
      method: 'PATCH',
      headers: {
        Cookie: `accessToken=${user2Token}`,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  test('15. Repeated completion requests do not reset completion timestamp unexpectedly', async () => {
    const firstGet = await LearningSession.findById(user1SessionId);
    const initialCompletedAt = firstGet.completedAt.toISOString();

    // Call complete again
    const res = await fetch(`${baseUrl}/api/learning/sessions/${user1SessionId}/complete`, {
      method: 'PATCH',
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.session.status, 'completed');
    assert.strictEqual(new Date(data.session.completedAt).toISOString(), initialCompletedAt);
    assert.ok(data.message.includes('already completed'));
  });

  test('16. Exploring the same topic creates a separate session without overwriting history', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString() }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.notStrictEqual(data.session._id, user1SessionId);

    // Verify User 1 now has 2 sessions in history
    const historyRes = await fetch(`${baseUrl}/api/learning/history`, {
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });
    const historyData = await historyRes.json();
    assert.strictEqual(historyData.count, 2);
  });

  test('17. Resuming in-progress session returns existing session without creating a duplicate (200)', async () => {
    // There is an in-progress session created in test 16
    const res = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString() }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session.status, 'in_progress');

    // Count should still be 2, not 3
    const historyRes = await fetch(`${baseUrl}/api/learning/history`, {
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });
    const historyData = await historyRes.json();
    assert.strictEqual(historyData.count, 2);
  });

  test('18. GET /api/learning/sessions/by-topic/:topicId retrieves latest session for authenticated user', async () => {
    // User 1 retrieves their session for activeTopic
    const res = await fetch(`${baseUrl}/api/learning/sessions/by-topic/${activeTopic._id}`, {
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.session);
    assert.strictEqual(data.session.user.toString(), user1._id.toString());
  });

  test('19. GET /api/learning/sessions/by-topic/:topicId isolates users and returns null session for non-existent session', async () => {
    // User 2 has not started a session for activeTopic
    const res = await fetch(`${baseUrl}/api/learning/sessions/by-topic/${activeTopic._id}`, {
      headers: {
        Cookie: `accessToken=${user2Token}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session, null);
  });

  test('20. Starting a session by topic slug resolves to the document ObjectId', async () => {
    const res = await fetch(`${baseUrl}/api/learning/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user2Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic.slug }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session.topic._id.toString(), activeTopic._id.toString());
  });
});
