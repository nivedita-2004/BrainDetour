const mongoose = require('mongoose');

const SPEECH_DURATIONS = [5, 10, 15];
const SPEECH_STATUS = ['in_progress', 'processing', 'completed', 'failed'];
const ACCURACY_CATEGORIES = [
  'demonstrably_incorrect',
  'requires_evidence',
  'debatable_interpretation',
  'unverified',
];

const speechSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: [true, 'Topic reference is required'],
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: [true, 'Duration in minutes is required'],
      enum: {
        values: SPEECH_DURATIONS,
        message: '{VALUE} is not a valid practice duration. Allowed durations are 5, 10, or 15 minutes.',
      },
    },
    status: {
      type: String,
      enum: {
        values: SPEECH_STATUS,
        message: '{VALUE} is not a valid speech session status',
      },
      default: 'in_progress',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    actualDurationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    transcript: {
      type: String,
      default: '',
      trim: true,
    },
    audioMetadata: {
      mimeType: { type: String, default: '' },
      sizeBytes: { type: Number, default: 0 },
      originalName: { type: String, default: '' },
      tempFilePath: { type: String, default: null },
      storedUntil: { type: Date, default: null },
    },

    analysis: {
      executiveSummary: { type: String, default: '' },
      whatUserSaid: [{ type: String }],
      strengths: [{ type: String }],
      missingConcepts: [
        {
          concept: { type: String, required: true },
          relevance: { type: String, required: true },
        },
      ],
      accuracyAndEvidence: [
        {
          claim: { type: String, required: true },
          assessment: { type: String, required: true },
          category: {
            type: String,
            enum: ACCURACY_CATEGORIES,
            default: 'requires_evidence',
          },
        },
      ],
      reasoningAndStructure: {
        introduction: { type: String, default: '' },
        logicalProgression: { type: String, default: '' },
        supportingArguments: { type: String, default: '' },
        examples: { type: String, default: '' },
        counterarguments: { type: String, default: '' },
        conclusion: { type: String, default: '' },
        digressions: { type: String, default: '' },
      },
      clarityOfExpression: { type: String, default: '' },
      strongerAnswer: {
        structure: { type: String, default: '' },
        exampleRewrite: { type: String, default: '' },
      },
      scores: {
        clarity: {
          score: { type: Number, min: 1, max: 5, default: 3 },
          explanation: { type: String, default: '' },
        },
        structure: {
          score: { type: Number, min: 1, max: 5, default: 3 },
          explanation: { type: String, default: '' },
        },
        topicRelevance: {
          score: { type: Number, min: 1, max: 5, default: 3 },
          explanation: { type: String, default: '' },
        },
        reasoning: {
          score: { type: Number, min: 1, max: 5, default: 3 },
          explanation: { type: String, default: '' },
        },
        evidenceAndExamples: {
          score: { type: Number, min: 1, max: 5, default: 3 },
          explanation: { type: String, default: '' },
        },
        overall: {
          score: { type: Number, min: 1, max: 5, default: 3 },
          explanation: { type: String, default: '' },
        },
      },
      actionPlan: [{ type: String }],
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for history pagination and queries
speechSessionSchema.index({ user: 1, createdAt: -1 });
speechSessionSchema.index({ user: 1, status: 1 });

speechSessionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

const SpeechSession = mongoose.model('SpeechSession', speechSessionSchema);

module.exports = SpeechSession;
module.exports.SPEECH_DURATIONS = SPEECH_DURATIONS;
module.exports.SPEECH_STATUS = SPEECH_STATUS;
module.exports.ACCURACY_CATEGORIES = ACCURACY_CATEGORIES;
