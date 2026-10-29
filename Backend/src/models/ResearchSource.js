const mongoose = require('mongoose');

const SOURCE_TYPES = [
  'article',
  'research_paper',
  'official_documentation',
  'reference',
  'other',
];

const researchSourceSchema = new mongoose.Schema(
  {
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: [true, 'Topic reference is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Source title is required'],
      trim: true,
    },
    url: {
      type: String,
      required: [true, 'Source URL is required'],
      trim: true,
      match: [/^https?:\/\/.+/i, 'Source URL must be a valid HTTP or HTTPS link'],
    },
    publisher: {
      type: String,
      trim: true,
      default: '',
    },
    summary: {
      type: String,
      trim: true,
      default: '',
    },
    sourceType: {
      type: String,
      enum: {
        values: SOURCE_TYPES,
        message: '{VALUE} is not a valid source type',
      },
      default: 'article',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Format JSON response
researchSourceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const ResearchSource = mongoose.model('ResearchSource', researchSourceSchema);

module.exports = ResearchSource;
module.exports.SOURCE_TYPES = SOURCE_TYPES;
