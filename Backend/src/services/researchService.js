const ResearchSource = require('../models/ResearchSource');

/**
 * Retrieves research sources associated with a given topic ID.
 *
 * @param {string|mongoose.Types.ObjectId} topicId
 * @returns {Promise<Array>}
 */
async function getSourcesByTopicId(topicId) {
  return ResearchSource.find({ topic: topicId })
    .select('title url publisher summary sourceType isVerified createdAt')
    .sort({ isVerified: -1, createdAt: 1 })
    .lean();
}

/**
 * Creates a new research source for a topic.
 *
 * @param {object} sourceData
 * @returns {Promise<object>}
 */
async function createSource(sourceData) {
  const source = new ResearchSource(sourceData);
  return source.save();
}

module.exports = {
  getSourcesByTopicId,
  createSource,
};
