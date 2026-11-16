const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const topicRoutes = require('./routes/topicRoutes');
const learningRoutes = require('./routes/learningRoutes');
const speechRoutes = require('./routes/speechRoutes');

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust first reverse proxy hop (Render / Vercel proxy) so req.ip and express-rate-limit
// work accurately behind X-Forwarded-For without throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

const DEFAULT_ALLOWED_ORIGINS = [
  'https://braindetours.com',
  'https://www.braindetours.com',
  'https://braindetour.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
];

/**
 * Normalize an origin string by trimming whitespace and stripping trailing slashes.
 * @param {string} origin
 * @returns {string}
 */
function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return '';
  }
  return origin.trim().replace(/\/+$/, '');
}

/**
 * Build the set of normalized allowed origins from default origins and environment variables.
 * Reads process.env dynamically so runtime/test changes to CLIENT_ORIGIN take effect immediately.
 * @returns {Set<string>}
 */
function getAllowedOrigins() {
  const origins = new Set(DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin));

  const envSources = [
    process.env.CLIENT_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
  ];

  for (const rawValue of envSources) {
    if (!rawValue || typeof rawValue !== 'string') continue;
    for (const part of rawValue.split(',')) {
      const normalized = normalizeOrigin(part);
      if (normalized && normalized !== '*') {
        origins.add(normalized);
      }
    }
  }

  return origins;
}

const corsOptions = {
  origin(requestOrigin, callback) {
    // Allow requests without an Origin header (e.g., server-to-server, health checks, CLI)
    if (!requestOrigin) {
      return callback(null, true);
    }

    const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
    const allowedOrigins = getAllowedOrigins();

    if (normalizedRequestOrigin && allowedOrigins.has(normalizedRequestOrigin)) {
      // Return the exact normalized origin without any trailing slash
      return callback(null, normalizedRequestOrigin);
    }

    const corsError = new Error(`Origin '${requestOrigin}' is not allowed by CORS`);
    corsError.statusCode = 403;
    return callback(corsError, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 204,
};

// 1. Security Headers via Helmet
// In development, adapt Content Security Policy so Vite dev server scripts and HMR are permitted
const isProduction = process.env.NODE_ENV === 'production';
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? undefined
      : {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'", "'unsafe-inline'", 'http://localhost:5173', 'ws://localhost:5173'],
            'connect-src': ["'self'", 'http://localhost:5173', 'ws://localhost:5173', 'http://localhost:5000'],
            'img-src': ["'self'", 'data:', 'blob:', 'http://localhost:5173'],
          },
        },
  })
);

// 2. Cross-Origin Resource Sharing (CORS) & Preflight Handling configured for frontend client
const corsMiddleware = cors(corsOptions);
app.use(corsMiddleware);
app.options('/{*splat}', corsMiddleware);

// 3. Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Cookie Parsing Middleware
app.use(cookieParser());

// 5. Mount API Routes under /api
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/speech', speechRoutes);


// 6. 404 Handler for Unmatched Routes
app.use(notFoundHandler);

// 7. Centralized Error Handler Middleware
app.use(errorHandler);

app.normalizeOrigin = normalizeOrigin;
app.getAllowedOrigins = getAllowedOrigins;
app.corsOptions = corsOptions;

module.exports = app;
