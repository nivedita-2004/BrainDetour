const { GoogleGenAI } = require('@google/genai');
const Topic = require('../models/Topic');
const { TOPIC_CATEGORIES, normalizeTitle } = require('../models/Topic');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const DEFAULT_POOL_THRESHOLD = parseInt(process.env.TOPIC_POOL_THRESHOLD, 10) || 50;
const DEFAULT_BATCH_SIZE = parseInt(process.env.TOPIC_BATCH_SIZE, 10) || 10;
const MAX_GENERATION_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 3;
const GENERATION_TIMEOUT_MS = 25000;

// Set of category names currently undergoing background refill to prevent duplicate parallel requests
const activeRefillLocks = new Set();

// Mock generator hook for deterministic automated unit/integration tests
let mockGenerator = null;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'why', 'how', 'what', 'can',
  'could', 'would', 'should', 'some', 'our', 'we', 'they', 'their', 'people', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'about', 'when'
]);

/**
 * Extracts significant keyword tokens from text for semantic deduplication.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function getSignificantTokens(text) {
  const normalized = normalizeTitle(text);
  return new Set(
    normalized
      .split(' ')
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Computes the token overlap similarity between two sets of keyword tokens.
 *
 * @param {Set<string>} tokensA
 * @param {Set<string>} tokensB
 * @returns {number} Score from 0.0 to 1.0
 */
function computeTokenOverlap(tokensA, tokensB) {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  return intersection / Math.min(tokensA.size, tokensB.size);
}

/**
 * Generates a clean, URL-safe slug from a topic title.
 *
 * @param {string} title
 * @returns {string}
 */
function slugify(title) {
  const base = title
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
  return base || `topic-${Date.now()}`;
}

/**
 * Checks if a candidate title is an exact or near duplicate of any topic in an existing set.
 *
 * @param {string} candidateTitle
 * @param {Array<{ title: string, normalizedTitle?: string }>} existingList
 * @param {number} [similarityThreshold=0.82]
 * @returns {boolean}
 */
function isDuplicateOrNearDuplicate(candidateTitle, existingList, similarityThreshold = 0.82) {
  const candidateNorm = normalizeTitle(candidateTitle);
  if (!candidateNorm) return true;

  const candidateTokens = getSignificantTokens(candidateTitle);

  for (const item of existingList) {
    const itemNorm = item.normalizedTitle || normalizeTitle(item.title);
    if (candidateNorm === itemNorm) {
      return true; // Exact normalized match
    }

    const itemTokens = getSignificantTokens(item.title);
    const overlap = computeTokenOverlap(candidateTokens, itemTokens);
    if (overlap >= similarityThreshold) {
      return true; // Substantive near-duplicate
    }
  }

  return false;
}

/**
 * Builds a prompt for Gemini instructing it to produce intriguing, non-generic topics
 * for a specific category.
 *
 * @param {string} category
 * @param {number} count
 * @param {Array<string>} [recentTitles=[]]
 * @returns {string}
 */
function buildGenerationPrompt(category, count, recentTitles = []) {
  const sampleExclusions =
    recentTitles.length > 0
      ? `\nDO NOT repeat or closely rephrase any of these already existing topics:\n${recentTitles
          .slice(0, 20)
          .map((t) => `- "${t}"`)
          .join('\n')}\n`
      : '';

  return `You are an expert scholar, science communicator, and curriculum architect for BrainDetour, an intellectual curiosity engine.

Generate exactly ${count} distinct, engaging, curiosity-provoking inquiry topics for the category: "${category}".

TOPIC DESIGN PRINCIPLES:
1. Avoid generic textbook titles (e.g. NEVER generate "Introduction to ${category}" or "History of Computers" or "What Is ${category}?").
2. Focus on specific paradoxes, unsolved mysteries, counterintuitive discoveries, thought experiments, everyday phenomena with deep underlying principles, and active scientific or philosophical debates.
3. Vary the rhetorical style: mix specific questions, intriguing statements, hypothetical scenarios, and counterintuitive discoveries. Do NOT start every title with "Why" or "How".
4. Distinguish established empirical facts from plausible hypotheses and open questions. Do not make misleading or clickbait claims.
5. Topics must be accessible and intellectually stimulating to a curious general audience without requiring specialist jargon.
${sampleExclusions}
DATA FORMAT:
Respond with a strict JSON array of objects. Each object must have:
- "title": Concise, intriguing title (between 15 and 90 characters).
- "description": 2-3 sentences (between 50 and 350 characters) explaining what makes this question or phenomenon surprising, its deeper significance, and the core inquiry question.

JSON format:
[
  {
    "title": "Topic title",
    "description": "Description explaining the core paradox or phenomenon..."
  }
]`;
}

/**
 * Extracts and parses JSON from Gemini's text response.
 *
 * @param {string} rawText
 * @returns {Array<object>}
 */
function parseGeminiJsonArray(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.topics)) return parsed.topics;
    throw new Error('Parsed JSON is not an array of topics');
  } catch (err) {
    const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    }
    throw new Error(`Failed to parse Gemini response as JSON array: ${err.message}`);
  }
}

/**
 * Requests a batch of new topics from Gemini with exponential backoff and jitter.
 *
 * @param {string} category
 * @param {number} count
 * @param {Array<string>} existingTitles
 * @returns {Promise<Array<{ title: string, description: string }>>}
 */
async function callGeminiForTopics(category, count, existingTitles = []) {
  if (mockGenerator) {
    return mockGenerator({ category, count, existingTitles });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend environment');
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildGenerationPrompt(category, count, existingTitles);

  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_GENERATION_RETRIES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Received empty response text from Gemini');
      }

      return parseGeminiJsonArray(responseText);
    } catch (err) {
      lastError = err;
      attempt++;

      const isTransient =
        err.status === 503 ||
        err.status === 429 ||
        err.status === 500 ||
        /unavailable|high demand|rate limit|quota/i.test(err.message || '');

      if (!isTransient || attempt > MAX_GENERATION_RETRIES) {
        break;
      }

      const delay = Math.min(8000, 1500 * Math.pow(2, attempt - 1) + Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Topic generation failed after retries');
}

/**
 * Generates and persists a batch of validated, deduplicated topics for a specific category.
 *
 * @param {string} category - Canonical category name
 * @param {number} [count=10] - Number of topics to generate
 * @param {string} [batchTag] - Optional generation batch tag
 * @returns {Promise<Array<object>>} Array of created Topic documents
 */
async function generateAndSaveTopics(category, count = DEFAULT_BATCH_SIZE, batchTag = null) {
  if (!TOPIC_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  // 1. Fetch existing topics in this category for deduplication
  const existingInDb = await Topic.find({ category })
    .select('title slug normalizedTitle')
    .lean();

  const existingTitles = existingInDb.map((t) => t.title);
  const existingSlugs = new Set(existingInDb.map((t) => t.slug));

  // 2. Request topic candidates from Gemini or mock
  const rawCandidates = await callGeminiForTopics(category, count, existingTitles);

  const batchId = batchTag || `batch-${Date.now()}`;
  const validToInsert = [];
  const localNormalizedSeen = new Set(existingInDb.map((t) => t.normalizedTitle || normalizeTitle(t.title)));

  // 3. Strict validation, semantic deduplication, and slug creation
  for (const candidate of rawCandidates) {
    const rawTitle = (candidate?.title || '').trim();
    const rawDesc = (candidate?.description || '').trim();

    if (!rawTitle || rawTitle.length < 10 || rawTitle.length > 150) {
      continue;
    }
    if (!rawDesc || rawDesc.length < 20 || rawDesc.length > 600) {
      continue;
    }

    const norm = normalizeTitle(rawTitle);
    if (localNormalizedSeen.has(norm)) {
      continue; // Duplicate within batch or database
    }

    // Check near-duplicate token overlap against database topics and current batch
    if (isDuplicateOrNearDuplicate(rawTitle, existingInDb)) {
      continue;
    }
    if (isDuplicateOrNearDuplicate(rawTitle, validToInsert)) {
      continue;
    }

    // Generate unique slug
    let baseSlug = slugify(rawTitle);
    let finalSlug = baseSlug;
    let collisionCounter = 2;
    while (existingSlugs.has(finalSlug)) {
      finalSlug = `${baseSlug}-${collisionCounter}`;
      collisionCounter++;
    }
    existingSlugs.add(finalSlug);
    localNormalizedSeen.add(norm);

    validToInsert.push({
      title: rawTitle,
      normalizedTitle: norm,
      slug: finalSlug,
      category,
      description: rawDesc,
      source: 'ai_generated',
      isActive: true,
      generationBatch: batchId,
    });
  }

  if (validToInsert.length === 0) {
    return [];
  }

  // 4. Save to MongoDB
  const createdTopics = await Topic.insertMany(validToInsert, { ordered: false });
  return createdTopics;
}

/**
 * Checks if the eligible pool for a category is below the threshold, and if so,
 * launches an asynchronous background refill without blocking client operations.
 *
 * @param {string} category
 * @param {number} [threshold=DEFAULT_POOL_THRESHOLD]
 * @param {number} [batchSize=DEFAULT_BATCH_SIZE]
 */
function triggerBackgroundRefillIfNeeded(
  category,
  threshold = DEFAULT_POOL_THRESHOLD,
  batchSize = DEFAULT_BATCH_SIZE
) {
  if (!category || !TOPIC_CATEGORIES.includes(category)) return;

  if (activeRefillLocks.has(category)) {
    return; // Already actively refilling this category
  }

  activeRefillLocks.add(category);

  // Execute in background
  (async () => {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) return;

      const activeCount = await Topic.countDocuments({ category, isActive: true });
      if (activeCount >= threshold) {
        return; // Pool is sufficiently stocked
      }

      await generateAndSaveTopics(category, batchSize);
    } catch (err) {
      // Non-blocking log: random topic selection continues uninterrupted from existing topics
      console.warn(`[TopicRefill] Background refill for ${category} skipped or failed: ${err.message}`);
    } finally {
      activeRefillLocks.delete(category);
    }
  })();
}

/**
 * Sets a mock generator function for automated testing.
 *
 * @param {Function|null} fn
 */
function setMockGenerator(fn) {
  mockGenerator = fn;
}

/**
 * Clears any active mock generator.
 */
function clearMockGenerator() {
  mockGenerator = null;
}

module.exports = {
  DEFAULT_POOL_THRESHOLD,
  DEFAULT_BATCH_SIZE,
  normalizeTitle,
  slugify,
  isDuplicateOrNearDuplicate,
  computeTokenOverlap,
  getSignificantTokens,
  generateAndSaveTopics,
  triggerBackgroundRefillIfNeeded,
  activeRefillLocks,
  setMockGenerator,
  clearMockGenerator,
};
