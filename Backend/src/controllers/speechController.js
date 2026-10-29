const fs = require('fs');
const mongoose = require('mongoose');
const SpeechSession = require('../models/SpeechSession');
const Topic = require('../models/Topic');
const geminiSpeechService = require('../services/geminiSpeechService');

/**
 * POST /api/speech/sessions
 * Create a new speech practice session for an assigned topic and duration.
 */
async function createSession(req, res, next) {
  try {
    const { topicId, durationMinutes } = req.body;

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

    // Check if topicId is a valid 24-character hexadecimal ObjectId or a valid kebab-case slug
    const isObjectId = mongoose.Types.ObjectId.isValid(cleanTopicId) && /^[0-9a-fA-F]{24}$/.test(cleanTopicId);
    const isSlug = /^(?![0-9]+$)[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(cleanTopicId);

    if (!isObjectId && !isSlug) {
      return res.status(400).json({
        success: false,
        message: 'Invalid topicId format',
      });
    }

    const durationNum = Number(durationMinutes);
    if (!SpeechSession.SPEECH_DURATIONS.includes(durationNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid durationMinutes. Allowed durations are 5, 10, or 15 minutes.',
      });
    }

    // Verify topic exists and is active (lookup by ObjectId or slug)
    let topic = null;
    if (isObjectId) {
      topic = await Topic.findOne({ _id: cleanTopicId, isActive: true });
    }
    if (!topic && isSlug) {
      topic = await Topic.findOne({ slug: cleanTopicId.toLowerCase(), isActive: true });
    }

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Active topic not found',
      });
    }

    // Concurrency / duplicate prevention: if an in-progress session for this user and topic
    // was initiated within the last 15 seconds, return it idempotently instead of duplicating
    const recentCutoff = new Date(Date.now() - 15 * 1000);
    const existingSession = await SpeechSession.findOne({
      user: req.user._id,
      topic: topic._id,
      status: 'in_progress',
      startedAt: { $gte: recentCutoff },
    }).populate('topic', 'title category description slug');

    if (existingSession) {
      return res.status(200).json({
        success: true,
        session: existingSession,
        resumed: true,
      });
    }

    const session = new SpeechSession({
      user: req.user._id,
      topic: topic._id,
      durationMinutes: durationNum,
      status: 'in_progress',
      startedAt: new Date(),
    });

    await session.save();
    await session.populate('topic', 'title category description slug');

    return res.status(201).json({
      success: true,
      session,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Asynchronous background worker for processing audio or transcript with Gemini.
 * Never blocks the client HTTP response.
 */
async function processSpeechAnalysisAsync({ sessionId, audioBuffer, mimeType, audioMetadata, transcriptText, topicTitle, topicDescription }) {
  try {
    let result;
    if (audioBuffer && audioBuffer.length > 0) {
      result = await geminiSpeechService.transcribeAndAnalyzeAudio({
        audioBuffer,
        mimeType: mimeType || 'audio/webm',
        topicTitle,
        topicDescription,
      });
    } else if (transcriptText) {
      result = await geminiSpeechService.analyzeTranscript({
        transcript: transcriptText,
        topicTitle,
        topicDescription,
      });
    } else {
      throw new Error('No audio data or transcript provided for processing');
    }

    // If audio was stored in a temporary file, clean it up upon successful completion
    if (audioMetadata?.tempFilePath && fs.existsSync(audioMetadata.tempFilePath)) {
      await fs.promises.unlink(audioMetadata.tempFilePath).catch(() => {});
    }

    // Update session upon successful AI analysis
    await SpeechSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'completed',
        transcript: result.transcript || transcriptText || '',
        analysis: result.analysis,
        audioMetadata: {
          mimeType: audioMetadata?.mimeType || '',
          sizeBytes: audioMetadata?.sizeBytes || 0,
          originalName: audioMetadata?.originalName || '',
          tempFilePath: null,
          storedUntil: null,
        },
        completedAt: new Date(),
        failureReason: null,
      },
      { returnDocument: 'after' }
    );
  } catch (error) {
    let cleanFailure = error.message || 'Gemini AI speech analysis encountered an unexpected error.';
    cleanFailure = geminiSpeechService.sanitizeErrorMessage(cleanFailure);

    // Record genuine failure state without crashing server
    // Retain audioMetadata.tempFilePath so retryAnalysis can reuse the recorded audio
    await SpeechSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'failed',
        failureReason: cleanFailure,
      },
      { returnDocument: 'after' }
    );
  }
}


/**
 * POST /api/speech/sessions/:id/complete
 * Completes recording and initiates asynchronous Gemini analysis.
 */
async function completeSession(req, res, next) {
  let tempFilePath = req.file?.path;

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID format',
      });
    }

    const session = await SpeechSession.findById(id).populate('topic');
    if (!session) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(404).json({
        success: false,
        message: 'Speech session not found',
      });
    }

    // Enforce strict ownership
    if (session.user.toString() !== req.user._id.toString()) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(404).json({
        success: false,
        message: 'Speech session not found',
      });
    }

    // Handle already completed session idempotently
    if (session.status === 'completed') {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(200).json({
        success: true,
        message: 'Session has already been completed and analyzed',
        session,
      });
    }

    // Handle already processing session
    if (session.status === 'processing') {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(200).json({
        success: true,
        message: 'Session is currently being analyzed',
        session,
      });
    }

    let actualDurationSeconds = Number(req.body.actualDurationSeconds) || 0;
    // Bound duration according to selected practice duration plus reasonable buffer
    if (session.durationMinutes) {
      actualDurationSeconds = Math.max(0, Math.min(actualDurationSeconds, session.durationMinutes * 60 + 120));
    }

    const transcriptText = typeof req.body.transcript === 'string' ? req.body.transcript.trim() : '';

    let audioBuffer = null;
    let mimeType = 'audio/webm';
    let audioMetadata = {
      mimeType: '',
      sizeBytes: 0,
      originalName: '',
    };

    if (req.file) {
      // Reject empty or nearly empty audio recordings
      if (req.file.size < 500 && !transcriptText) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        return res.status(400).json({
          success: false,
          message: 'The uploaded audio recording is empty or too short. Please speak clearly into your microphone before submitting.',
        });
      }

      audioBuffer = await fs.promises.readFile(req.file.path);
      mimeType = req.file.mimetype || 'audio/webm';
      audioMetadata = {
        mimeType,
        sizeBytes: req.file.size,
        originalName: req.file.originalname,
        tempFilePath: req.file.path,
        storedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000), // Retain for retries
      };

      // Retain temporary file on disk for retry resilience; clear variable so catch handler does not unlink
      tempFilePath = null;
    }

    if ((!audioBuffer || audioBuffer.length === 0) && !transcriptText) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either an audio file recording or a spoken transcript text',
      });
    }

    // Transition session status to 'processing'
    session.status = 'processing';
    session.actualDurationSeconds = actualDurationSeconds;
    session.completedAt = new Date();
    session.audioMetadata = audioMetadata;
    if (transcriptText) {
      session.transcript = transcriptText;
    }
    await session.save();


    // Trigger async processing in background
    processSpeechAnalysisAsync({
      sessionId: session._id,
      audioBuffer,
      mimeType,
      audioMetadata,
      transcriptText,
      topicTitle: session.topic?.title || 'General Inquiry',
      topicDescription: session.topic?.description || '',
    });

    return res.status(202).json({
      success: true,
      message: 'Audio received and analysis started. Check status by polling.',
      session,
    });
  } catch (error) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {}
    }
    next(error);
  }
}

/**
 * GET /api/speech/sessions/:id
 * Retrieve session details, current analysis status, and diagnostic report.
 */
async function getSession(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID format',
      });
    }

    const session = await SpeechSession.findById(id).populate('topic', 'title category description slug');
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Speech session not found',
      });
    }

    // Ownership check
    if (session.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Speech session not found',
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
 * GET /api/speech/history
 * Retrieve paginated list of previous speech lab sessions for the authenticated user.
 */
async function getHistory(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { user: req.user._id };

    const [sessions, total] = await Promise.all([
      SpeechSession.find(query)
        .populate('topic', 'title category description slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SpeechSession.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/speech/sessions/:id/retry-analysis
 * Re-attempts failed Gemini analysis.
 * Reuses original audio from disk if present, falls back to transcript,
 * atomically locks the session to prevent concurrent duplicate retries,
 * and preserves completed reports.
 */
async function retryAnalysis(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID format',
      });
    }

    const session = await SpeechSession.findById(id).populate('topic');
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Speech session not found',
      });
    }

    if (session.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Speech session not found',
      });
    }

    // Preservation of completed reports
    if (session.status === 'completed') {
      return res.status(200).json({
        success: true,
        message: 'Analysis report is already completed and preserved. No retry needed.',
        session,
      });
    }

    // Prevent duplicate retry if already processing
    if (session.status === 'processing') {
      return res.status(409).json({
        success: false,
        message: 'Analysis retry is already in progress. Please wait for current processing to complete.',
        session,
      });
    }

    if (session.status !== 'failed') {
      return res.status(400).json({
        success: false,
        message: `Cannot retry analysis for session with status '${session.status}'. Only failed sessions can be retried.`,
      });
    }

    // Atomic update to lock session status to 'processing' to prevent concurrent race conditions
    const lockedSession = await SpeechSession.findOneAndUpdate(
      { _id: id, user: req.user._id, status: 'failed' },
      { $set: { status: 'processing', failureReason: null } },
      { returnDocument: 'after' }
    ).populate('topic');

    if (!lockedSession) {
      return res.status(409).json({
        success: false,
        message: 'Analysis retry is already in progress or session status has changed.',
      });
    }

    // Check if original audio is still available on disk
    let audioBuffer = null;
    let mimeType = lockedSession.audioMetadata?.mimeType || 'audio/webm';
    const tempPath = lockedSession.audioMetadata?.tempFilePath;

    if (tempPath && fs.existsSync(tempPath)) {
      try {
        audioBuffer = await fs.promises.readFile(tempPath);
      } catch (readErr) {
        console.error('Failed to read preserved audio file for retry:', readErr);
      }
    }

    const hasTranscript = Boolean(lockedSession.transcript && lockedSession.transcript.trim());

    if ((!audioBuffer || audioBuffer.length === 0) && !hasTranscript) {
      // Revert status to failed with actionable message
      lockedSession.status = 'failed';
      lockedSession.failureReason = 'The original audio recording is no longer available on the server and transcript text is missing. Please record a new presentation session.';
      await lockedSession.save();

      return res.status(400).json({
        success: false,
        message: 'The original audio recording is no longer available on the server and transcript text is missing. Please record a new presentation session.',
      });
    }

    // Trigger async processing using preserved audio (or fallback transcript)
    processSpeechAnalysisAsync({
      sessionId: lockedSession._id,
      audioBuffer,
      mimeType,
      audioMetadata: lockedSession.audioMetadata,
      transcriptText: lockedSession.transcript || '',
      topicTitle: lockedSession.topic?.title || 'General Inquiry',
      topicDescription: lockedSession.topic?.description || '',
    });

    return res.status(202).json({
      success: true,
      message: 'Analysis retry initiated. Check status by polling.',
      session: lockedSession,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createSession,
  completeSession,
  getSession,
  getHistory,
  retryAnalysis,
};
