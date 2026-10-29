const mongoose = require('mongoose');

const TOPIC_CATEGORIES = [
  'Psychology',
  'History',
  'Science',
  'Technology',
  'Philosophy',
  'Art',
  'Sociology',
  'Nature',
  'Curious',
  'Literature',
];

/**
 * Generates a normalized, lowercase, punctuation-stripped representation of a title
 * for fast and robust duplicate detection.
 *
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const topicSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Topic title is required'],
      trim: true,
    },
    normalizedTitle: {
      type: String,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: [true, 'Topic slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Topic category is required'],
      enum: {
        values: TOPIC_CATEGORIES,
        message: '{VALUE} is not a supported category',
      },
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      enum: ['curated', 'ai_generated'],
      default: 'curated',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    generationBatch: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal filtering and deduplication performance
topicSchema.index({ category: 1, isActive: 1 });
topicSchema.index({ category: 1, normalizedTitle: 1 });

// Ensure normalizedTitle is populated before saving
topicSchema.pre('validate', function () {
  if (this.title && (!this.normalizedTitle || this.isModified('title'))) {
    this.normalizedTitle = normalizeTitle(this.title);
  }
});

// Format JSON response with clean id while preserving both _id and id
topicSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const idStr = ret._id ? ret._id.toString() : ret.id;
    ret.id = idStr;
    ret._id = idStr;
    delete ret.__v;
    return ret;
  },
});

topicSchema.set('toObject', {
  transform: (_doc, ret) => {
    const idStr = ret._id ? ret._id.toString() : ret.id;
    ret.id = idStr;
    ret._id = idStr;
    delete ret.__v;
    return ret;
  },
});

const Topic = mongoose.model('Topic', topicSchema);

module.exports = Topic;
module.exports.TOPIC_CATEGORIES = TOPIC_CATEGORIES;
module.exports.normalizeTitle = normalizeTitle;
