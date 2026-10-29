/**
 * Middleware to handle unmatched routes with a clean JSON 404 response.
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
    },
  });
}

/**
 * Centralized application error handler middleware.
 * Ensures stack traces and sensitive error internals are never exposed in production.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = Number(err.statusCode || err.status) || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  const message = statusCode === 500 && isProduction
    ? 'Internal server error'
    : err.message || 'An unexpected error occurred';

  const response = {
    success: false,
    error: {
      message,
      statusCode,
    },
  };

  // Include stack trace only in development and test environments
  if (!isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  // Log 5xx errors on the server
  if (statusCode >= 500) {
    console.error(`[Error ${statusCode}] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
