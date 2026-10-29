const mongoose = require('mongoose');

/**
 * Lightweight record of topic impressions served to authenticated users or anonymous sessions.
 * Used to avoid returning recently shown topics and eliminate repetitive consecutive spins.
 * Backed by a MongoDB TTL index that automatically purges impressions after 7 days.
 */
const topicImpressionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    clientToken: {
      type: String,
      index: true,
      default: null,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 604800, // 7 days TTL
    },
  },
  {
    timestamps: false,
  }
);

topicImpressionSchema.index({ user: 1, category: 1, createdAt: -1 });
topicImpressionSchema.index({ clientToken: 1, category: 1, createdAt: -1 });

const TopicImpression = mongoose.model('TopicImpression', topicImpressionSchema);

module.exports = TopicImpression;

