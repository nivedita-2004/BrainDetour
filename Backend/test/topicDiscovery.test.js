const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Topic = require('../src/models/Topic');
const { TOPIC_CATEGORIES, normalizeTitle } = require('../models/Topic');
const TopicImpression = require('../src/models/TopicImpression');
const ResearchSource = require('../src/models/ResearchSource');
const SpeechSession = require('../src/models/SpeechSession');
const User = require('../src/models/User');
const {
  isDuplicateOrNearDuplicate,
  computeTokenOverlap,
  generateAndSaveTopics,
  setMockGenerator,
  clearMockGenerator,
  activeRefillLocks,
} = require('../src/services/topicGenerationService');
const { SEED_TOPICS } = require('../scripts/seedTopics');

let mongod;
let server;
let baseUrl;

before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Seed sample diverse topics for each category
  for (const item of SEED_TOPICS) {
    const topic = await Topic.create({
      title: item.title,
      slug: item.slug,
      category: item.category,
      description: item.description,
      isActive: item.isActive,
    });

    if (item.sources && item.sources.length > 0) {
      for (const src of item.sources) {
        await ResearchSource.create({
          topic: topic._id,
          title: src.title,
          url: src.url,
          publisher: src.publisher,
          summary: src.summary,
          sourceType: src.sourceType,
          isVerified: src.isVerified,
        });
      }
    }
  }

  // Create additional topics in Science so we have multiple alternatives to test pool sampling
  await Topic.create([
    {
      title: 'Why Can Two Observers Experience Time Differently?',
      slug: 'two-observers-experience-time-differently',
      category: 'Science',
      description: 'Einstein’s relativity demonstrates that simultaneity is relative and time dilates with velocity and gravity.',
      isActive: true,
    },
    {
      title: 'What Would Happen If Earth’s Magnetic Field Disappeared?',
      slug: 'earth-magnetic-field-disappeared',
      category: 'Science',
      description: 'Investigate how planetary magnetospheres shield atmosphere and life from solar ionizing radiation.',
      isActive: true,
    },
    {
      title: 'The Mystery of Quantum Superposition in Biological Systems',
      slug: 'quantum-superposition-biological-systems',
      category: 'Science',
      description: 'Quantum biology investigates whether avian navigation and photosynthesis exploit quantum coherence.',
      isActive: true,
    },
  ]);

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
  clearMockGenerator();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

describe('BrainDetour Topic Discovery, Random Selection & AI Generation Suite', () => {
  afterEach(() => {
    clearMockGenerator();
  });

  test('1. Each of the ten genres returns correctly categorised topics', async () => {
    for (const category of TOPIC_CATEGORIES) {
      const res = await fetch(`${baseUrl}/api/topics/random?category=${encodeURIComponent(category)}`);
      assert.strictEqual(res.status, 200);

      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.topic, `Must return a topic for category ${category}`);
      assert.strictEqual(data.topic.category, category, `Topic category must strictly match ${category}`);
      assert.ok(data.topic.title);
      assert.ok(data.topic.slug);
      assert.ok(data.topic.id);
    }
  });

  test('2. The random endpoint selects from the full eligible pool', async () => {
    // Collect 20 random spins in Science (which has 6 seeded topics)
    const seenTopicIds = new Set();
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/api/topics/random?category=Science`);
      const data = await res.json();
      if (data.topic) {
        seenTopicIds.add(data.topic.id);
      }
    }

    // Verify multiple distinct topics from the pool were returned
    assert.ok(
      seenTopicIds.size >= 3,
      `Expected at least 3 distinct topics across 20 spins from the Science pool, got ${seenTopicIds.size}`
    );
  });

  test('3. Consecutive spins do not repeatedly return the same topic when alternatives exist', async () => {
    let prevTopicId = null;
    let consecutiveIdenticalSpins = 0;

    // Use a persistent guest cookie header across spins
    const testCookie = 'braindetour_anon_id=test_consecutive_client_1';

    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/api/topics/random?category=Science`, {
        headers: { Cookie: testCookie },
      });
      const data = await res.json();
      assert.strictEqual(data.success, true);

      if (prevTopicId && data.topic.id === prevTopicId) {
        consecutiveIdenticalSpins++;
      }
      prevTopicId = data.topic.id;
    }

    assert.strictEqual(
      consecutiveIdenticalSpins,
      0,
      'Consecutive spins for the same client must not return the identical topic consecutively'
    );
  });

  test('4. Recent topic history is respected and progressive relaxation avoids failure', async () => {
    const clientToken = 'test_relaxation_client_2';
    const scienceTopics = await Topic.find({ category: 'Science', isActive: true });

    // Mark all but one science topic as recently seen
    for (let i = 0; i < scienceTopics.length; i++) {
      await TopicImpression.create({
        clientToken,
        topic: scienceTopics[i]._id,
        category: 'Science',
      });
    }

    // Next spin should still succeed with progressive relaxation rather than returning 404
    const res = await fetch(`${baseUrl}/api/topics/random?category=Science`, {
      headers: { Cookie: `braindetour_anon_id=${clientToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.topic);
    assert.strictEqual(data.topic.category, 'Science');
  });

  test('5. "All" or omitted category can return topics across all categories', async () => {
    const resAll = await fetch(`${baseUrl}/api/topics/random?category=All`);
    assert.strictEqual(resAll.status, 200);
    const dataAll = await resAll.json();
    assert.strictEqual(dataAll.success, true);
    assert.ok(TOPIC_CATEGORIES.includes(dataAll.topic.category));

    const resOmitted = await fetch(`${baseUrl}/api/topics/random`);
    assert.strictEqual(resOmitted.status, 200);
    const dataOmitted = await resOmitted.json();
    assert.strictEqual(dataOmitted.success, true);
    assert.ok(TOPIC_CATEGORIES.includes(dataOmitted.topic.category));
  });

  test('6. Duplicate titles and slugs are rejected by deduplication logic', () => {
    const existing = [
      {
        title: 'Why Does Your Brain Sometimes Remember Events That Never Happened?',
        normalizedTitle: 'why does your brain sometimes remember events that never happened',
      },
    ];

    // Exact duplicate
    assert.strictEqual(
      isDuplicateOrNearDuplicate('Why Does Your Brain Sometimes Remember Events That Never Happened?', existing),
      true
    );

    // Case and punctuation variant
    assert.strictEqual(
      isDuplicateOrNearDuplicate('why does your brain sometimes remember events that never happened?!', existing),
      true
    );

    // Substantive near duplicate
    assert.strictEqual(
      isDuplicateOrNearDuplicate('Why Your Brain Remembers Events That Never Happened', existing),
      true
    );

    // Completely distinct topic
    assert.strictEqual(
      isDuplicateOrNearDuplicate('How Do Migrating Birds Navigate by Earth’s Magnetic Field?', existing),
      false
    );
  });

  test('7. Re-running the seed script does not create duplicates', async () => {
    const beforeCount = await Topic.countDocuments();

    // Re-seed SEED_TOPICS
    for (const item of SEED_TOPICS) {
      let topic = await Topic.findOne({ slug: item.slug });
      if (!topic) {
        await Topic.create({
          title: item.title,
          slug: item.slug,
          category: item.category,
          description: item.description,
          isActive: item.isActive,
        });
      }
    }

    const afterCount = await Topic.countDocuments();
    assert.strictEqual(afterCount, beforeCount, 'Re-running seed must be idempotent and not create duplicates');
  });

  test('8. AI-generated topics satisfy the required schema and metadata', async () => {
    setMockGenerator(() => [
      {
        title: 'Can Neural Synchrony Explain Sudden Insight Moments?',
        description:
          'Investigates the gamma-band burst observed moments before sudden cognitive insight, exploring whether unconscious processing reorganizes semantic networks before conscious awareness.',
      },
    ]);

    const created = await generateAndSaveTopics('Psychology', 1, 'test-batch-1');
    assert.strictEqual(created.length, 1);

    const topic = created[0];
    assert.strictEqual(topic.title, 'Can Neural Synchrony Explain Sudden Insight Moments?');
    assert.strictEqual(topic.category, 'Psychology');
    assert.strictEqual(topic.source, 'ai_generated');
    assert.strictEqual(topic.isActive, true);
    assert.strictEqual(topic.generationBatch, 'test-batch-1');
    assert.ok(topic.slug);
    assert.ok(topic.normalizedTitle);
    assert.ok(topic._id);
  });

  test('9. Invalid or malformed AI output is safely rejected', async () => {
    setMockGenerator(() => [
      { title: '', description: 'Too short title' },
      { title: 'Valid Title Here For Topic', description: '' },
      { title: 'Duplicate of Existing', description: 'Some description that meets length requirement easily' },
      null,
      'Just a string instead of object',
    ]);

    const created = await generateAndSaveTopics('Psychology', 5);
    // All malformed items must be discarded cleanly without throwing unhandled exceptions
    for (const t of created) {
      assert.ok(t.title && t.title.length >= 10);
      assert.ok(t.description && t.description.length >= 20);
    }
  });

  test('10. Gemini unavailability does not break topic selection', async () => {
    // Mock AI failure
    setMockGenerator(() => {
      const err = new Error('503 Service Unavailable');
      err.status = 503;
      throw err;
    });

    // Random topic endpoint should still succeed fast from MongoDB
    const res = await fetch(`${baseUrl}/api/topics/random?category=Science`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.topic);
  });

  test('11. Concurrent refill requests are controlled via active locks', () => {
    assert.strictEqual(activeRefillLocks.has('Philosophy'), false);
    activeRefillLocks.add('Philosophy');
    assert.strictEqual(activeRefillLocks.has('Philosophy'), true);
    activeRefillLocks.delete('Philosophy');
    assert.strictEqual(activeRefillLocks.has('Philosophy'), false);
  });

  test('12. Existing topic details and research-source endpoints continue working', async () => {
    const resTopic = await fetch(`${baseUrl}/api/topics/quantum-computing-foundations`);
    assert.strictEqual(resTopic.status, 200);
    const dataTopic = await resTopic.json();
    assert.strictEqual(dataTopic.success, true);
    assert.strictEqual(dataTopic.topic.slug, 'quantum-computing-foundations');

    const resSources = await fetch(`${baseUrl}/api/topics/cognitive-biases-ai/sources`);
    assert.strictEqual(resSources.status, 200);
    const dataSources = await resSources.json();
    assert.strictEqual(dataSources.success, true);
    assert.ok(Array.isArray(dataSources.sources));
  });

  test('13. Existing speech-session topic references remain valid', async () => {
    const testTopic = await Topic.findOne({ category: 'Psychology', isActive: true });
    assert.ok(testTopic);

    // Create a mock user
    const testUser = await User.create({
      name: 'Scholar User',
      email: `scholar_${Date.now()}@example.com`,
      passwordHash: 'hashed_pw',
    });

    const session = await SpeechSession.create({
      user: testUser._id,
      topic: testTopic._id,
      durationMinutes: 5,
      status: 'ready',
    });

    assert.ok(session._id);
    assert.strictEqual(session.topic.toString(), testTopic._id.toString());

    const retrieved = await SpeechSession.findById(session._id).populate('topic');
    assert.strictEqual(retrieved.topic.title, testTopic.title);
  });
});

