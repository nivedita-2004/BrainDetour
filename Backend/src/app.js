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

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

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

// 2. Cross-Origin Resource Sharing (CORS) configured for frontend client
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

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

module.exports = app;
