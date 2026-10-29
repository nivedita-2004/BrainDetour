const mongoose = require('mongoose');

const SESSION_STATUS = ['in_progress', 'completed'];

const learningSessionSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: {
        values: SESSION_STATUS,
        message: '{VALUE} is not a valid session status',
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
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    reflection: {
      whatILearned: {
        type: String,
        trim: true,
        maxlength: [5000, 'whatILearned cannot exceed 5000 characters'],
        default: '',
      },
      whatSurprisedMe: {
        type: String,
        trim: true,
        maxlength: [5000, 'whatSurprisedMe cannot exceed 5000 characters'],
        default: '',
      },
      myOpinion: {
        type: String,
        trim: true,
        maxlength: [5000, 'myOpinion cannot exceed 5000 characters'],
        default: '',
      },
      questionsRemaining: {
        type: String,
        trim: true,
        maxlength: [5000, 'questionsRemaining cannot exceed 5000 characters'],
        default: '',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user history queries
learningSessionSchema.index({ user: 1, updatedAt: -1 });
learningSessionSchema.index({ user: 1, startedAt: -1 });

learningSessionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

const LearningSession = mongoose.model('LearningSession', learningSessionSchema);

module.exports = LearningSession;
module.exports.SESSION_STATUS = SESSION_STATUS;
