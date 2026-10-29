const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Topic = require('../src/models/Topic');
const SpeechSession = require('../src/models/SpeechSession');
const { generateAccessToken } = require('../src/utils/tokens');
const geminiSpeechService = require('../src/services/geminiSpeechService');


let mongod;
let server;
let baseUrl;

let user1;
let user2;
let user1Token;
let user2Token;
let activeTopic;
let inactiveTopic;

// Sample realistic mock response matching all 9 criteria
const validMockGeminiResponse = {
  transcript:
    'In this presentation, I want to argue that confirmation bias in machine learning models is largely a product of uncurated training data. When humans evaluate models blindly, hallucinations drop by thirty percent.',
  analysis: {
    executiveSummary:
      'The scholar clearly articulated the relationship between training data curation and confirmation bias in machine learning.',
    whatUserSaid: [
      'Machine learning models exhibit confirmation bias from uncurated data.',
      'Blind human evaluation audits reduce hallucinations by 30%.',
    ],
    strengths: [
      'Succinct causal framing between training curation and bias.',
      'Specific quantitative claim regarding human evaluation efficacy.',
    ],
    missingConcepts: [
      {
        concept: 'Reinforcement Learning from Human Feedback (RLHF)',
        relevance: 'Essential for addressing how alignment techniques influence bias mitigation.',
      },
    ],
    accuracyAndEvidence: [
      {
        claim: 'Hallucinations drop by thirty percent in blind audits.',
        assessment: 'While directional evidence supports this, thirty percent is context-dependent and requires specific benchmark citation.',
        category: 'requires_evidence',
      },
    ],
    reasoningAndStructure: {
      introduction: 'Direct thesis statement setting the scope effectively.',
      logicalProgression: 'Logical movement from data causes to human evaluation remedies.',
      supportingArguments: 'Relies primarily on empirical audit claims.',
      examples: 'Mentions blind audits as a concrete evaluation methodology.',
      counterarguments: 'Did not address compute cost trade-offs of human audits.',
      conclusion: 'Strong implicit takeaway though could be summarized more explicitly.',
      digressions: 'Minimal digression, speech stayed tightly focused.',
    },
    clarityOfExpression:
      'Clear phrasing with academic diction. Sentences were concise and syntactically well-ordered.',
    strongerAnswer: {
      structure: 'Thesis -> Empirical evidence from benchmark X -> Counter-perspective -> Synthesis.',
      exampleRewrite:
        'To establish how uncurated data propagates bias, consider how foundational models ingest systemic skew without epistemic filters...',
    },
    scores: {
      clarity: { score: 4, explanation: 'Ideas were clearly articulated with minimal hesitation.' },
      structure: { score: 4, explanation: 'Clear progression from problem to evaluation.' },
      topicRelevance: { score: 5, explanation: 'Directly addressed the assigned inquiry.' },
      reasoning: { score: 4, explanation: 'Causal link was cogent.' },
      evidenceAndExamples: { score: 3, explanation: 'Specific 30% claim needed a literature citation.' },
      overall: { score: 4, explanation: 'Well-structured, compelling oral presentation.' },
    },
    actionPlan: [
      'Cite specific benchmark studies when referencing quantitative percentages.',
      'Anticipate scalability limitations of blind human audits.',
      'Add a dedicated concluding synthesis sentence before finishing.',
    ],
  },
};

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_minimum_16_chars';
  process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_minimum_16_chars';
  process.env.GEMINI_API_KEY = 'test_gemini_key_for_unit_tests';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  const passwordHash = await bcrypt.hash('TestPassword123!', 10);

  user1 = await User.create({
    name: 'Speech Scholar One',
    email: 'scholar1@braindetour.com',
    passwordHash,
  });

  user2 = await User.create({
    name: 'Speech Scholar Two',
    email: 'scholar2@braindetour.com',
    passwordHash,
  });

  user1Token = generateAccessToken(user1._id);
  user2Token = generateAccessToken(user2._id);

  activeTopic = await Topic.create({
    title: 'Epistemic Trust in Foundation Models',
    slug: 'epistemic-trust-models',
    category: 'Technology',
    description: 'Analyzing cognitive reliance on generative systems.',
    isActive: true,
  });

  inactiveTopic = await Topic.create({
    title: 'Inactive Speech Topic',
    slug: 'inactive-speech-topic',
    category: 'Philosophy',
    description: 'Inactive topic for testing.',
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
  geminiSpeechService.__resetMockHandler();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

beforeEach(() => {
  // Reset mock before each test to default valid response
  geminiSpeechService.__setMockHandler(async () => validMockGeminiResponse);
});

describe('BrainDetour Speech Lab API Suite', () => {
  let createdSessionId;

  test('1. Unauthenticated request to create or view speech session is rejected with 401', async () => {
    const resCreate = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: 5 }),
    });
    assert.strictEqual(resCreate.status, 401);

    const resHistory = await fetch(`${baseUrl}/api/speech/history`);
    assert.strictEqual(resHistory.status, 401);
  });

  test('2. Creating session with invalid duration returns 400 (only 5, 10, 15 allowed)', async () => {
    const invalidDurations = [2, 7, 20, 0, -5];
    for (const d of invalidDurations) {
      const res = await fetch(`${baseUrl}/api/speech/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `accessToken=${user1Token}`,
        },
        body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: d }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /Allowed durations are 5, 10, or 15/);
    }
  });

  test('3. Creating session with missing or inactive topic fails cleanly', async () => {
    // Missing topicId
    const resMissing = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ durationMinutes: 5 }),
    });
    assert.strictEqual(resMissing.status, 400);

    // Inactive topic
    const resInactive = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: inactiveTopic._id.toString(), durationMinutes: 10 }),
    });
    assert.strictEqual(resInactive.status, 404);
  });

  test('4. Authenticated user can create valid session for 5, 10, or 15 minutes', async () => {
    const res = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: 15 }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.session._id);
    assert.strictEqual(data.session.durationMinutes, 15);
    assert.strictEqual(data.session.status, 'in_progress');
    assert.strictEqual(data.session.topic.title, activeTopic.title);
    assert.strictEqual(data.session.transcript, '');

    createdSessionId = data.session._id;
  });

  test('4a. Authenticated user can create valid session using topic slug and resolves to real ObjectId', async () => {
    // Create a new distinct topic for slug testing
    const slugTopic = await Topic.create({
      title: 'Quantum Superposition Basics',
      slug: 'quantum-superposition-basics',
      category: 'Science',
      description: 'Understanding quantum mechanics foundations.',
      isActive: true,
    });

    const res = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: 'quantum-superposition-basics', durationMinutes: 10 }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.session._id);
    assert.strictEqual(data.session.durationMinutes, 10);
    assert.strictEqual(data.session.status, 'in_progress');
    assert.strictEqual(data.session.topic.title, slugTopic.title);
    assert.strictEqual(data.session.topic.slug, 'quantum-superposition-basics');
    assert.strictEqual(data.session.topic._id.toString(), slugTopic._id.toString());
  });

  test('4b. Starting session with invalid topicId format returns 400 with Invalid topicId format', async () => {
    const invalidFormats = [
      'custom-topic-with-special!@#',
      'invalid topic with spaces',
      '12345', // Not 24-hex nor valid slug
      '',
      12345,
      { id: 'object' },
    ];

    for (const invalidId of invalidFormats) {
      const res = await fetch(`${baseUrl}/api/speech/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `accessToken=${user1Token}`,
        },
        body: JSON.stringify({ topicId: invalidId, durationMinutes: 5 }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /topicId is required|Invalid topicId format/);
    }
  });

  test('4c. Starting session again rapidly for same in-progress topic returns existing session without duplicating', async () => {
    const beforeCount = await SpeechSession.countDocuments({ user: user1._id });

    // Request session creation with the existing activeTopic
    const res = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: 15 }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.resumed, true);
    assert.strictEqual(data.session._id, createdSessionId);

    const afterCount = await SpeechSession.countDocuments({ user: user1._id });
    assert.strictEqual(afterCount, beforeCount);
  });

  test('4d. Topic model serialization preserves both _id and id matching the MongoDB ObjectId', async () => {
    const rawTopic = await Topic.findOne({ slug: 'quantum-superposition-basics' });
    const jsonTopic = rawTopic.toJSON();
    assert.ok(jsonTopic.id);
    assert.ok(jsonTopic._id);
    assert.strictEqual(jsonTopic.id, rawTopic._id.toString());
    assert.strictEqual(jsonTopic._id, rawTopic._id.toString());
  });

  test('5. Session ownership is strictly enforced on GET /api/speech/sessions/:id', async () => {
    // Owner (user1) can read session
    const resOwner = await fetch(`${baseUrl}/api/speech/sessions/${createdSessionId}`, {
      headers: { Cookie: `accessToken=${user1Token}` },
    });
    assert.strictEqual(resOwner.status, 200);
    const dataOwner = await resOwner.json();
    assert.strictEqual(dataOwner.session._id, createdSessionId);

    // Different authenticated user (user2) receives 404
    const resNonOwner = await fetch(`${baseUrl}/api/speech/sessions/${createdSessionId}`, {
      headers: { Cookie: `accessToken=${user2Token}` },
    });
    assert.strictEqual(resNonOwner.status, 404);
  });

  test('6. Completing session with audio upload processes asynchronously and populates analysis', async () => {
    const formData = new FormData();
    const fakeAudioData = Buffer.concat([Buffer.from('RIFF....WAVEfmt ....data....'), Buffer.alloc(2000, 1)]);
    const audioBlob = new Blob([fakeAudioData], { type: 'audio/webm' });
    formData.append('audio', audioBlob, 'practice_take.webm');
    formData.append('actualDurationSeconds', '240');


    const res = await fetch(`${baseUrl}/api/speech/sessions/${createdSessionId}/complete`, {
      method: 'POST',
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
      body: formData,
    });

    assert.strictEqual(res.status, 202);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session.status, 'processing');

    // Wait briefly for asynchronous background worker to finish
    await new Promise((r) => setTimeout(r, 200));

    // Poll GET /api/speech/sessions/:id
    const resPoll = await fetch(`${baseUrl}/api/speech/sessions/${createdSessionId}`, {
      headers: { Cookie: `accessToken=${user1Token}` },
    });
    assert.strictEqual(resPoll.status, 200);
    const updated = await resPoll.json();
    assert.strictEqual(updated.session.status, 'completed');
    assert.strictEqual(updated.session.transcript, validMockGeminiResponse.transcript);
    assert.ok(updated.session.analysis);

    // Validate presence of all 9 sections in analysis
    const analysis = updated.session.analysis;
    assert.ok(analysis.executiveSummary);
    assert.ok(analysis.whatUserSaid.length > 0);
    assert.ok(analysis.strengths.length > 0);
    assert.ok(analysis.missingConcepts.length > 0);
    assert.ok(analysis.accuracyAndEvidence.length > 0);
    assert.strictEqual(analysis.accuracyAndEvidence[0].category, 'requires_evidence');
    assert.ok(analysis.reasoningAndStructure.introduction);
    assert.ok(analysis.clarityOfExpression);
    assert.ok(analysis.strongerAnswer.structure);
    assert.ok(analysis.scores.clarity.score >= 1 && analysis.scores.clarity.score <= 5);
    assert.ok(analysis.scores.overall.score >= 1 && analysis.scores.overall.score <= 5);
    assert.ok(analysis.actionPlan.length >= 3);
  });

  test('7. Repeating completion on already completed session returns 200 idempotently', async () => {
    const resRepeat = await fetch(`${baseUrl}/api/speech/sessions/${createdSessionId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ transcript: 'new text ignored' }),
    });

    assert.strictEqual(resRepeat.status, 200);
    const data = await resRepeat.json();
    assert.strictEqual(data.session.status, 'completed');
  });

  test('8. Non-owner cannot complete another user’s speech session', async () => {
    // User2 attempts to complete User1's session
    const res = await fetch(`${baseUrl}/api/speech/sessions/${createdSessionId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user2Token}`,
      },
      body: JSON.stringify({ transcript: 'Malicious attempt' }),
    });
    assert.strictEqual(res.status, 404);
  });

  test('9. Gemini failure records genuine failure state and supports retry', async () => {
    // 1. Create a fresh session
    const resCreate = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: 5 }),
    });
    const { session: newSession } = await resCreate.json();

    // 2. Set mock handler to simulate a Gemini API error
    geminiSpeechService.__setMockHandler(async () => {
      throw new Error('Gemini API quota exceeded or upstream network timeout');
    });

    // 3. Complete session with transcript
    const resComplete = await fetch(`${baseUrl}/api/speech/sessions/${newSession._id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({
        transcript: 'Testing error recovery and retry flow in speech lab.',
      }),
    });
    assert.strictEqual(resComplete.status, 202);

    // Wait for background worker
    await new Promise((r) => setTimeout(r, 200));

    // 4. Verify session transitioned to 'failed'
    const resFailed = await fetch(`${baseUrl}/api/speech/sessions/${newSession._id}`, {
      headers: { Cookie: `accessToken=${user1Token}` },
    });
    const failedData = await resFailed.json();
    assert.strictEqual(failedData.session.status, 'failed');
    assert.match(failedData.session.failureReason, /quota exceeded/);

    // 5. Restore valid Gemini mock
    geminiSpeechService.__setMockHandler(async () => validMockGeminiResponse);

    // 6. Trigger retry endpoint
    const resRetry = await fetch(`${baseUrl}/api/speech/sessions/${newSession._id}/retry-analysis`, {
      method: 'POST',
      headers: {
        Cookie: `accessToken=${user1Token}`,
      },
    });
    assert.strictEqual(resRetry.status, 202);

    // Wait for async retry worker
    await new Promise((r) => setTimeout(r, 200));

    // 7. Verify session successfully recovered to 'completed'
    const resRecovered = await fetch(`${baseUrl}/api/speech/sessions/${newSession._id}`, {
      headers: { Cookie: `accessToken=${user1Token}` },
    });
    const recoveredData = await resRecovered.json();
    assert.strictEqual(recoveredData.session.status, 'completed');
    assert.strictEqual(recoveredData.session.failureReason, null);
    assert.ok(recoveredData.session.analysis.executiveSummary);
  });

  test('10. User history is paginated and strictly isolated per user', async () => {
    // User1 history
    const resUser1 = await fetch(`${baseUrl}/api/speech/history?page=1&limit=5`, {
      headers: { Cookie: `accessToken=${user1Token}` },
    });
    assert.strictEqual(resUser1.status, 200);
    const data1 = await resUser1.json();
    assert.strictEqual(data1.success, true);
    assert.ok(Array.isArray(data1.sessions));
    assert.ok(data1.sessions.length >= 2);
    assert.strictEqual(data1.pagination.page, 1);
    assert.strictEqual(data1.pagination.limit, 5);

    // Verify all sessions belong to user1
    for (const s of data1.sessions) {
      assert.strictEqual(s.user.toString(), user1._id.toString());
      assert.ok(s.topic.title);
    }

    // User2 history is empty because user2 has not created any sessions
    const resUser2 = await fetch(`${baseUrl}/api/speech/history`, {
      headers: { Cookie: `accessToken=${user2Token}` },
    });
    assert.strictEqual(resUser2.status, 200);
    const data2 = await resUser2.json();
    assert.strictEqual(data2.sessions.length, 0);
    assert.strictEqual(data2.pagination.total, 0);
  });

  test('11. Empty or nearly empty audio file (<500 bytes) is rejected with 400', async () => {
    const resCreate = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: 5 }),
    });
    const { session } = await resCreate.json();

    const formData = new FormData();
    const tinyAudio = Buffer.from('RIFF1234'); // 8 bytes
    formData.append('audio', new Blob([tinyAudio], { type: 'audio/webm' }), 'empty.webm');

    const res = await fetch(`${baseUrl}/api/speech/sessions/${session._id}/complete`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user1Token}` },
      body: formData,
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /empty or too short/);
  });

  test('12. Unsupported non-audio MIME type is rejected with 400 by multer filter', async () => {
    const resCreate = await fetch(`${baseUrl}/api/speech/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `accessToken=${user1Token}`,
      },
      body: JSON.stringify({ topicId: activeTopic._id.toString(), durationMinutes: 5 }),
    });
    const { session } = await resCreate.json();

    const formData = new FormData();
    const textData = Buffer.alloc(1000, 'A');
    formData.append('audio', new Blob([textData], { type: 'text/plain' }), 'notes.txt');

    const res = await fetch(`${baseUrl}/api/speech/sessions/${session._id}/complete`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user1Token}` },
      body: formData,
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /Unsupported audio format/);
  });

  test('13. Unit: 503 response followed by a successful retry', async () => {
    let callCount = 0;
    const result = await geminiSpeechService.executeWithRetry(
      'Test 503 Retry',
      async (attempt) => {
        callCount++;
        if (attempt === 0) {
          const err = new Error('This model is currently experiencing high demand. Spikes in demand are usually temporary.');
          err.status = 503;
          throw err;
        }
        return { success: true, processedAttempt: attempt };
      },
      { maxRetries: 2, baseDelayMs: 20, maxDelayMs: 50 }
    );

    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.processedAttempt, 1);
  });

  test('14. Unit: Repeated 503 responses exhaust the retry limit', async () => {
    let callCount = 0;
    await assert.rejects(
      async () => {
        await geminiSpeechService.executeWithRetry(
          'Test 503 Exhaustion',
          async () => {
            callCount++;
            const err = new Error('503 UNAVAILABLE: Model overloaded');
            err.status = 503;
            throw err;
          },
          { maxRetries: 2, baseDelayMs: 15, maxDelayMs: 30 }
        );
      },
      (err) => {
        assert.strictEqual(err.status, 503);
        assert.match(err.message, /503 UNAVAILABLE/);
        return true;
      }
    );
    assert.strictEqual(callCount, 3); // initial attempt (0) + 2 retries (1, 2)
  });

  test('15. Unit: 429 response and retry handling respecting Retry-After', async () => {
    let callCount = 0;
    const startTime = Date.now();
    const result = await geminiSpeechService.executeWithRetry(
      'Test 429 Retry',
      async (attempt) => {
        callCount++;
        if (attempt === 0) {
          const err = new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded');
          err.status = 429;
          err.headers = { get: (name) => (name === 'retry-after' ? '0.05' : null) };
          throw err;
        }
        return { recovered: true };
      },
      { maxRetries: 2, baseDelayMs: 20, maxDelayMs: 100 }
    );

    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.recovered, true);
    assert.ok(Date.now() - startTime >= 40);
  });

  test('16. Unit: Permanent error (e.g. 400 INVALID_ARGUMENT) is not retried', async () => {
    let callCount = 0;
    await assert.rejects(
      async () => {
        await geminiSpeechService.executeWithRetry(
          'Test Permanent Error',
          async () => {
            callCount++;
            const err = new Error('400 INVALID_ARGUMENT: Unsupported parameter');
            err.status = 400;
            throw err;
          },
          { maxRetries: 3, baseDelayMs: 20 }
        );
      },
      (err) => {
        assert.strictEqual(err.status, 400);
        return true;
      }
    );
    assert.strictEqual(callCount, 1); // Only 1 attempt, zero retries
  });

  test('17. Retry endpoint prevents concurrent duplicate retries with 409 Conflict', async () => {
    const processingSession = await SpeechSession.create({
      user: user1._id,
      topic: activeTopic._id,
      durationMinutes: 5,
      status: 'processing',
      startedAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/speech/sessions/${processingSession._id}/retry-analysis`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user1Token}` },
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /already in progress/i);
  });

  test('18. Retry endpoint preserves completed reports without overwriting', async () => {
    const completedSession = await SpeechSession.create({
      user: user1._id,
      topic: activeTopic._id,
      durationMinutes: 5,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      transcript: 'Preserved original presentation transcript.',
      analysis: validMockGeminiResponse.analysis,
    });

    const res = await fetch(`${baseUrl}/api/speech/sessions/${completedSession._id}/retry-analysis`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user1Token}` },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.match(data.message, /already completed and preserved/i);
    assert.strictEqual(data.session.transcript, 'Preserved original presentation transcript.');
  });

  test('19. Retry endpoint returns 400 with actionable message if audio is missing and transcript is empty', async () => {
    const failedSession = await SpeechSession.create({
      user: user1._id,
      topic: activeTopic._id,
      durationMinutes: 5,
      status: 'failed',
      startedAt: new Date(),
      transcript: '',
      audioMetadata: {
        tempFilePath: path.join(__dirname, '../uploads/temp/deleted-file-999.webm'),
      },
    });

    const res = await fetch(`${baseUrl}/api/speech/sessions/${failedSession._id}/retry-analysis`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user1Token}` },
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /original audio recording is no longer available/i);

    // Verify session remains 'failed'
    const checkSession = await SpeechSession.findById(failedSession._id);
    assert.strictEqual(checkSession.status, 'failed');
  });

  test('20. Manual retry succeeds using preserved audio file on disk and cleans it on success', async () => {
    const tempDir = path.join(__dirname, '../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const testAudioPath = path.join(tempDir, `test-retry-${Date.now()}.webm`);
    const audioContent = Buffer.concat([Buffer.from('RIFF....WAVEfmt ....data....'), Buffer.alloc(1500, 2)]);
    await fs.promises.writeFile(testAudioPath, audioContent);

    const failedAudioSession = await SpeechSession.create({
      user: user1._id,
      topic: activeTopic._id,
      durationMinutes: 5,
      status: 'failed',
      failureReason: 'Temporary failure during previous run',
      startedAt: new Date(),
      transcript: '',
      audioMetadata: {
        mimeType: 'audio/webm',
        sizeBytes: audioContent.length,
        originalName: 'test-retry.webm',
        tempFilePath: testAudioPath,
        storedUntil: new Date(Date.now() + 3600000),
      },
    });

    // Valid mock response for retry
    geminiSpeechService.__setMockHandler(async () => validMockGeminiResponse);

    const res = await fetch(`${baseUrl}/api/speech/sessions/${failedAudioSession._id}/retry-analysis`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user1Token}` },
    });

    assert.strictEqual(res.status, 202);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.session.status, 'processing');

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 200));

    const checkSession = await SpeechSession.findById(failedAudioSession._id);
    assert.strictEqual(checkSession.status, 'completed');
    assert.strictEqual(checkSession.transcript, validMockGeminiResponse.transcript);
    assert.ok(checkSession.analysis);
    assert.strictEqual(checkSession.audioMetadata.tempFilePath, null);

    // Verify file unlinked on disk
    assert.strictEqual(fs.existsSync(testAudioPath), false);
  });

  test('21. Authentication and session ownership are strictly enforced on retry-analysis', async () => {
    const session = await SpeechSession.create({
      user: user1._id,
      topic: activeTopic._id,
      durationMinutes: 5,
      status: 'failed',
      transcript: 'Some transcript',
    });

    // Unauthenticated -> 401
    const resUnauth = await fetch(`${baseUrl}/api/speech/sessions/${session._id}/retry-analysis`, {
      method: 'POST',
    });
    assert.strictEqual(resUnauth.status, 401);

    // Non-owner (user2) -> 404
    const resNonOwner = await fetch(`${baseUrl}/api/speech/sessions/${session._id}/retry-analysis`, {
      method: 'POST',
      headers: { Cookie: `accessToken=${user2Token}` },
    });
    assert.strictEqual(resNonOwner.status, 404);
  });
});

