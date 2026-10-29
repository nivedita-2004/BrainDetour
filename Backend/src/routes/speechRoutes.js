const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/authMiddleware');
const speechController = require('../controllers/speechController');

const router = express.Router();

// Ensure temporary upload directory exists
const tempUploadDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Multer storage for temporary recording file before processing
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `speech-${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_AUDIO_MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
];

const fileFilter = (_req, file, cb) => {
  const mime = file.mimetype ? file.mimetype.toLowerCase() : '';
  if (ALLOWED_AUDIO_MIMES.includes(mime) || mime.startsWith('audio/')) {
    cb(null, true);
  } else {
    const error = new Error('Unsupported audio format. Please upload an audio file (.webm, .ogg, .wav, .mp3, .m4a).');
    error.statusCode = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max (more than enough for 15-minute Opus audio ~4MB)
  },
  fileFilter,
});


// Protect AI endpoints from excessive automated burst requests
const speechRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 practice submissions per 15 minutes in production
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Speech Lab request limit reached. Please wait a few minutes before starting another session.',
  },
});

// All speech lab endpoints require scholar authentication
router.use(requireAuth);

// 1. Create a speech session
router.post('/sessions', speechRateLimiter, speechController.createSession);

// 2. Finalize capture and initiate Gemini audio processing
router.post(
  '/sessions/:id/complete',
  speechRateLimiter,
  (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload error',
        });
      }
      next();
    });
  },
  speechController.completeSession
);


// 3. Retrieve user's session and analysis status (for polling & results view)
router.get('/sessions/:id', speechController.getSession);

// 4. Retrieve paginated session history for current user
router.get('/history', speechController.getHistory);

// 5. Retry failed analysis
router.post('/sessions/:id/retry-analysis', speechRateLimiter, speechController.retryAnalysis);

module.exports = router;
