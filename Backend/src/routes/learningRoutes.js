const express = require('express');
const {
  startSession,
  getMyHistory,
  getSessionById,
  getSessionByTopic,
  updateReflection,
  completeSession,
} = require('../controllers/learningController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Require authentication for all learning history & reflection routes
router.use(requireAuth);

// 1. Start a new session
router.post('/sessions', startSession);

// 2. Get my learning history (paginated)
router.get('/history', getMyHistory);

// 3. Get session by topic ID
router.get('/sessions/by-topic/:topicId', getSessionByTopic);

// 4. Get a single learning session by ID
router.get('/sessions/:id', getSessionById);

// 5. Update reflection fields
router.patch('/sessions/:id/reflection', updateReflection);

// 6. Complete session and record duration
router.patch('/sessions/:id/complete', completeSession);

module.exports = router;
