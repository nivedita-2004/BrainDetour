const mongoose = require('mongoose');
const LearningSession = require('../models/LearningSession');
const Topic = require('../models/Topic');

const ALLOWED_REFLECTION_FIELDS = [
  'whatILearned',
  'whatSurprisedMe',
  'myOpinion',
  'questionsRemaining',
];

/**
 * POST /api/learning/sessions
 * Starts a new learning session for the authenticated user and an active topic.
 * Resumes an existing in-progress session if one already exists for this topic.
 */
async function startSession(req, res, next) {
  try {
    const { topicId } = req.body;

    if (!topicId || (typeof topicId === 'string' && !topicId.trim())) {
      return res.status(400).json({
        success: false,
        message: 'topicId is required',
      });
    }

    if (typeof topicId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid topicId format',
      });
    }

    const cleanTopicId = topicId.trim();
    let topic = null;

    if (mongoose.Types.ObjectId.isValid(cleanTopicId)) {
      topic = await Topic.findOne({ _id: cleanTopicId, isActive: true }).select(
        'title slug category description'
      );
      if (!topic) {
        return res.status(404).json({
          success: false,
          message: 'Topic not found or inactive',
        });
      }
    } else {
      // If not an ObjectId, check if it matches an existing active topic slug
      const slugTopic = await Topic.findOne({ slug: cleanTopicId.toLowerCase(), isActive: true }).select(
        'title slug category description'
      );
      if (!slugTopic) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topicId format',
        });
      }
      topic = slugTopic;
    }

    // Check if an in-progress session already exists for this user and topic to prevent duplicate sessions
    const existingSession = await LearningSession.findOne({
      user: req.user._id,
      topic: topic._id,
      status: 'in_progress',
    }).populate('topic', 'title slug category description');

    if (existingSession) {
      return res.status(200).json({
        success: true,
        message: 'Resumed existing in-progress learning session',
        session: existingSession,
        resumed: true,
      });
    }

    const session = await LearningSession.create({
      user: req.user._id,
      topic: topic._id,
      status: 'in_progress',
      startedAt: new Date(),
    });

    await session.populate('topic', 'title slug category description');

    return res.status(201).json({
      success: true,
      message: 'Learning session started successfully',
      session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/learning/sessions/by-topic/:topicId
 * Retrieves the most recent learning session for the authenticated user and given topic.
 */
async function getSessionByTopic(req, res, next) {
  try {
    const { topicId } = req.params;

    if (!topicId || !topicId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'topicId is required',
      });
    }

    const cleanTopicId = topicId.trim();
    let topic = null;

    if (mongoose.Types.ObjectId.isValid(cleanTopicId)) {
      topic = await Topic.findOne({ _id: cleanTopicId, isActive: true }).select('_id slug title');
    }
    if (!topic) {
      topic = await Topic.findOne({ slug: cleanTopicId.toLowerCase(), isActive: true }).select('_id slug title');
    }

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found or inactive',
      });
    }

    const session = await LearningSession.findOne({
      user: req.user._id,
      topic: topic._id,
    })
      .populate('topic', 'title slug category description')
      .sort({ updatedAt: -1, startedAt: -1 });

    return res.status(200).json({
      success: true,
      session: session || null,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/learning/history
 * Returns the learning history of the authenticated user with pagination.
 */
async function getMyHistory(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { user: req.user._id };

    const total = await LearningSession.countDocuments(query);
    const sessions = await LearningSession.find(query)
      .populate('topic', 'title slug category')
      .sort({ updatedAt: -1, startedAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: sessions.length,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      sessions,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/learning/sessions/:id
 * Retrieves a single learning session belonging to the authenticated user.
 */
async function getSessionById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Learning session not found',
      });
    }

    const session = await LearningSession.findOne({
      _id: id,
      user: req.user._id,
    }).populate('topic', 'title slug category description');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Learning session not found',
      });
    }

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/learning/sessions/:id/reflection
 * Updates one or more reflection fields without erasing other fields.
 */
async function updateReflection(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Learning session not found',
      });
    }

    const session = await LearningSession.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Learning session not found',
      });
    }

    const bodyKeys = Object.keys(req.body || {});
    if (bodyKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one reflection field must be provided',
      });
    }

    // Reject unexpected fields and validate string types / lengths
    for (const key of bodyKeys) {
      if (!ALLOWED_REFLECTION_FIELDS.includes(key)) {
        return res.status(400).json({
          success: false,
          message: `Unexpected field: "${key}"`,
        });
      }

      const val = req.body[key];
      if (typeof val !== 'string') {
        return res.status(400).json({
          success: false,
          message: `${key} must be a string`,
        });
      }

      if (val.length > 5000) {
        return res.status(400).json({
          success: false,
          message: `${key} exceeds maximum length of 5000 characters`,
        });
      }
    }

    // Apply updates partially
    for (const key of bodyKeys) {
      session.reflection[key] = req.body[key].trim();
    }

    await session.save();
    await session.populate('topic', 'title slug category');

    return res.status(200).json({
      success: true,
      message: 'Reflection updated successfully',
      session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/learning/sessions/:id/complete
 * Marks a session as completed and calculates durationSeconds.
 */
async function completeSession(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Learning session not found',
      });
    }

    const session = await LearningSession.findOne({
      _id: id,
      user: req.user._id,
    }).populate('topic', 'title slug category');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Learning session not found',
      });
    }

    // Idempotent: already completed sessions return existing data without modifying completedAt
    if (session.status === 'completed') {
      return res.status(200).json({
        success: true,
        message: 'Learning session was already completed',
        session,
      });
    }

    session.status = 'completed';
    session.completedAt = new Date();

    const durationSeconds = Math.max(
      0,
      Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 1000)
    );
    session.durationSeconds = durationSeconds;

    await session.save();

    return res.status(200).json({
      success: true,
      message: 'Learning session completed successfully',
      session,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  startSession,
  getMyHistory,
  getSessionById,
  getSessionByTopic,
  updateReflection,
  completeSession,
};
