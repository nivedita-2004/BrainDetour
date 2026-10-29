const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const { TOPIC_CATEGORIES } = require('../models/Topic');
const TopicImpression = require('../models/TopicImpression');
const researchService = require('../services/researchService');
const { triggerBackgroundRefillIfNeeded } = require('../services/topicGenerationService');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * Normalizes and validates category query against supported categories.
 *
 * @param {string} categoryInput
 * @returns {string|null} Canonical category name or null if invalid
 */
function findCanonicalCategory(categoryInput) {
  if (!categoryInput) return null;
  const trimmed = categoryInput.trim().toLowerCase();
  return TOPIC_CATEGORIES.find((cat) => cat.toLowerCase() === trimmed) || null;
}

/**
 * Safely extracts authenticated user ID from cookies or Authorization header without throwing.
 *
 * @param {object} req
 * @returns {string|null}
 */
function getOptionalUserId(req) {
  try {
    const token =
      req.cookies?.accessToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) return null;
    const decoded = verifyAccessToken(token);
    return decoded?.userId || null;
  } catch (_) {
    return null;
  }
}

/**
 * GET /api/topics
 * Returns all active topics, optionally filtered by category.
 */
async function getAllTopics(req, res, next) {
  try {
    const query = { isActive: true };

    if (req.query.category && req.query.category !== 'All') {
      const canonical = findCanonicalCategory(req.query.category);
      if (!canonical) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Must be one of: ${TOPIC_CATEGORIES.join(', ')}`,
        });
      }
      query.category = canonical;
    }

    const topics = await Topic.find(query)
      .select('title slug category description createdAt source')
      .sort({ category: 1, title: 1 });

    return res.status(200).json({
      success: true,
      count: topics.length,
      topics,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/topics/random
 * Returns a randomly selected active topic using the full eligible topic pool,
 * actively avoiding recent repetition for the current user or guest session.
 */
async function getRandomTopic(req, res, next) {
  try {
    const baseQuery = { isActive: true };
    let canonical = null;

    if (req.query.category && req.query.category !== 'All') {
      canonical = findCanonicalCategory(req.query.category);
      if (!canonical) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Must be one of: ${TOPIC_CATEGORIES.join(', ')}`,
        });
      }
      baseQuery.category = canonical;
    }

    // 1. Verify that any eligible topics exist for the requested query
    const totalEligible = await Topic.countDocuments(baseQuery);
    if (totalEligible === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active topics found matching the criteria',
      });
    }

    // 2. Identify user or client context to avoid immediate repetitions
    const userId = req.user?._id?.toString() || getOptionalUserId(req);
    let clientToken = req.cookies?.braindetour_anon_id || req.headers['x-client-id'] || req.ip;

    // Issue anonymous tracking cookie if not present and user is unauthenticated
    if (!userId && !req.cookies?.braindetour_anon_id) {
      const anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      res.cookie('braindetour_anon_id', anonId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      clientToken = anonId;
    }

    // 3. Retrieve recent topic impressions to avoid repeats
    const impressionQuery = userId ? { user: userId } : { clientToken };
    if (canonical) {
      impressionQuery.category = canonical;
    }

    const recentImpressions = await TopicImpression.find(impressionQuery)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('topic')
      .lean();

    const excludedIds = new Set(recentImpressions.map((imp) => imp.topic.toString()));

    // Also support explicit frontend exclusion via query param if provided
    if (req.query.exclude && mongoose.Types.ObjectId.isValid(req.query.exclude)) {
      excludedIds.add(req.query.exclude.toString());
    }

    // 4. Try selecting from unviewed topics first
    let selectionQuery = { ...baseQuery };
    if (excludedIds.size > 0) {
      const excludedArray = Array.from(excludedIds).map((id) => new mongoose.Types.ObjectId(id));
      const unviewedQuery = { ...baseQuery, _id: { $nin: excludedArray } };
      const unviewedCount = await Topic.countDocuments(unviewedQuery);

      if (unviewedCount > 0) {
        selectionQuery = unviewedQuery;
      } else if (totalEligible > 1 && recentImpressions.length > 0) {
        // Progressive relaxation: exclude at least the most recently seen topic to prevent consecutive repeats
        const lastTopicId = recentImpressions[0].topic;
        selectionQuery = { ...baseQuery, _id: { $ne: lastTopicId } };
      }
    }

    // 5. Select topic pseudo-randomly using MongoDB aggregation $sample for optimal distribution
    const sampled = await Topic.aggregate([
      { $match: selectionQuery },
      { $sample: { size: 1 } },
    ]);

    let randomTopic = null;
    if (sampled && sampled.length > 0) {
      randomTopic = Topic.hydrate(sampled[0]);
    } else {
      // Fallback in case of unexpected sampling condition
      const fallbackCount = await Topic.countDocuments(selectionQuery);
      const randomIndex = Math.floor(Math.random() * Math.max(1, fallbackCount));
      randomTopic = await Topic.findOne(selectionQuery)
        .select('title slug category description createdAt')
        .skip(randomIndex);
    }

    if (!randomTopic) {
      // Last-resort fallback to any eligible topic
      randomTopic = await Topic.findOne(baseQuery).select('title slug category description createdAt');
    }

    // 6. Record impression non-blockingly for repetition prevention
    if (randomTopic && randomTopic._id) {
      TopicImpression.create({
        user: userId || null,
        clientToken: userId ? null : clientToken,
        topic: randomTopic._id,
        category: randomTopic.category,
      }).catch((err) => {
        // Silently catch impression logging errors so user flow is never disrupted
        console.warn('[TopicImpression] Warning: impression record failed:', err.message);
      });
    }

    // 7. Check if category pool requires background replenishment
    if (canonical) {
      triggerBackgroundRefillIfNeeded(canonical);
    }

    // Format output ensuring both id and _id are preserved
    const topicOutput = randomTopic.toJSON ? randomTopic.toJSON() : randomTopic;

    return res.status(200).json({
      success: true,
      topic: topicOutput,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/topics/:slug
 * Returns the topic details for a given slug.
 */
async function getTopicBySlug(req, res, next) {
  try {
    const slug = req.params.slug?.trim().toLowerCase();

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Topic slug is required',
      });
    }

    const topic = await Topic.findOne({ slug, isActive: true }).select(
      'title slug category description createdAt updatedAt source'
    );

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    return res.status(200).json({
      success: true,
      topic,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/topics/:slug/sources
 * Returns the reviewed research sources associated with a topic.
 */
async function getTopicSources(req, res, next) {
  try {
    const slug = req.params.slug?.trim().toLowerCase();

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Topic slug is required',
      });
    }

    const topic = await Topic.findOne({ slug, isActive: true }).select('title slug category');

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    const sources = await researchService.getSourcesByTopicId(topic._id);

    const response = {
      success: true,
      topic: {
        id: topic._id,
        title: topic.title,
        slug: topic.slug,
        category: topic.category,
      },
      count: sources.length,
      sources,
    };

    if (sources.length === 0) {
      response.message = 'No research sources available for this topic yet';
    }

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllTopics,
  getRandomTopic,
  getTopicBySlug,
  getTopicSources,
  findCanonicalCategory,
};
