const express = require('express');
const {
  getAllTopics,
  getRandomTopic,
  getTopicBySlug,
  getTopicSources,
} = require('../controllers/topicController');

const router = express.Router();

// 1. Get all active topics
router.get('/', getAllTopics);

// 2. Get a random active topic (must precede /:slug to avoid collision)
router.get('/random', getRandomTopic);

// 3. Get topic by slug
router.get('/:slug', getTopicBySlug);

// 4. Get research sources for a topic
router.get('/:slug/sources', getTopicSources);

module.exports = router;
