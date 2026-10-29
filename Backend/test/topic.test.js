const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Topic = require('../src/models/Topic');
const ResearchSource = require('../src/models/ResearchSource');
const { SEED_TOPICS } = require('../scripts/seedTopics');

let mongod;
let server;
let baseUrl;

before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Seed topics into test database
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

  // Create an inactive topic to verify filtering
  await Topic.create({
    title: 'Hidden Inactive Draft Topic',
    slug: 'hidden-inactive-draft',
    category: 'Curious',
    description: 'This topic is a draft and should not appear to guests.',
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

describe('BrainDetour Topic Management and Research API', () => {
  test('1. GET /api/topics returns all active topics and excludes inactive ones', async () => {
    const res = await fetch(`${baseUrl}/api/topics`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(typeof data.count, 'number');
    const expectedActiveTopics = SEED_TOPICS.filter((topic) => topic.isActive);
    assert.strictEqual(data.count, expectedActiveTopics.length);
    assert.ok(Array.isArray(data.topics));
    assert.strictEqual(new Set(data.topics.map((topic) => topic.title)).size, data.count);

    // Verify inactive topic is excluded
    const inactiveFound = data.topics.some((t) => t.slug === 'hidden-inactive-draft');
    assert.strictEqual(inactiveFound, false, 'Inactive topic must be filtered out');

    // Verify structure
    const sample = data.topics[0];
    assert.ok(sample.id);
    assert.ok(sample.title);
    assert.ok(sample.slug);
    assert.ok(sample.category);
  });

  test('2. GET /api/topics?category=Science filters topics by category', async () => {
    const res = await fetch(`${baseUrl}/api/topics?category=Science`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    const expectedScienceTopics = SEED_TOPICS.filter(
      (topic) => topic.isActive && topic.category === 'Science'
    );
    assert.strictEqual(data.count, expectedScienceTopics.length);
    assert.ok(data.count > 1, 'Science must provide multiple unique roulette topics');
    assert.strictEqual(new Set(data.topics.map((topic) => topic.title)).size, data.count);
    data.topics.forEach((topic) => {
      assert.strictEqual(topic.category, 'Science');
    });
  });

  test('3. GET /api/topics with invalid category returns 400 error', async () => {
    const res = await fetch(`${baseUrl}/api/topics?category=Astrology`);
    assert.strictEqual(res.status, 400);

    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Invalid category'));
  });

  test('4. GET /api/topics/random returns one random active topic', async () => {
    const res = await fetch(`${baseUrl}/api/topics/random`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.topic);
    assert.ok(data.topic.title);
    assert.ok(data.topic.slug);
    assert.ok(data.topic.category);
  });

  test('5. GET /api/topics/random?category=Science returns a topic in the Science category', async () => {
    const res = await fetch(`${baseUrl}/api/topics/random?category=Science`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.topic.category, 'Science');
    assert.ok(
      SEED_TOPICS.some(
        (topic) => topic.isActive && topic.category === 'Science' && topic.slug === data.topic.slug
      )
    );
  });

  test('6. GET /api/topics/random with invalid category returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/topics/random?category=UnknownCategory`);
    assert.strictEqual(res.status, 400);

    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Invalid category'));
  });

  test('7. GET /api/topics/:slug returns the correct active topic', async () => {
    const res = await fetch(`${baseUrl}/api/topics/cognitive-biases-ai`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.topic.slug, 'cognitive-biases-ai');
    assert.strictEqual(data.topic.category, 'Psychology');
    assert.ok(data.topic.description);
  });

  test('8. GET /api/topics/:slug returns 404 for unknown or inactive topic', async () => {
    // Unknown slug
    const unknownRes = await fetch(`${baseUrl}/api/topics/non-existent-topic-slug`);
    assert.strictEqual(unknownRes.status, 404);
    const unknownData = await unknownRes.json();
    assert.strictEqual(unknownData.success, false);
    assert.strictEqual(unknownData.message, 'Topic not found');

    // Inactive topic
    const inactiveRes = await fetch(`${baseUrl}/api/topics/hidden-inactive-draft`);
    assert.strictEqual(inactiveRes.status, 404);
  });

  test('9. GET /api/topics/:slug/sources returns research sources associated with the topic', async () => {
    const res = await fetch(`${baseUrl}/api/topics/cognitive-biases-ai/sources`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.topic.slug, 'cognitive-biases-ai');
    assert.strictEqual(data.count, 3);
    assert.strictEqual(data.sources.length, 3);

    const source = data.sources[0];
    assert.ok(source.title);
    assert.ok(source.url.startsWith('http'));
    assert.ok(source.publisher);
    assert.ok(source.summary);
    assert.ok(source.sourceType);
    assert.strictEqual(source.isVerified, false, 'Unreviewed sources must remain isVerified: false');
  });

  test('10. GET /api/topics/:slug/sources returns empty array for topic with no sources', async () => {
    // 'history-scientific-revolutions' has 0 sources seeded
    const res = await fetch(`${baseUrl}/api/topics/history-scientific-revolutions/sources`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.count, 0);
    assert.deepStrictEqual(data.sources, []);
    assert.ok(data.message.includes('No research sources available'));
  });

  test('11. Guests can access all topic endpoints without authentication cookies', async () => {
    // No Cookie or Authorization header sent
    const resList = await fetch(`${baseUrl}/api/topics`);
    assert.strictEqual(resList.status, 200);

    const resRandom = await fetch(`${baseUrl}/api/topics/random`);
    assert.strictEqual(resRandom.status, 200);

    const resTopic = await fetch(`${baseUrl}/api/topics/epistemic-humility-in-science`);
    assert.strictEqual(resTopic.status, 200);

    const resSources = await fetch(`${baseUrl}/api/topics/neural-evidence-synthesis/sources`);
    assert.strictEqual(resSources.status, 200);
  });
});
