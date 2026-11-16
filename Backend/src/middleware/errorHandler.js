const { redactSensitiveText } = require('../utils/mailer');

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
 * Sanitize and validate an error or diagnostic object before logging or returning metadata.
 * Never blindly trusts err.safeDiagnostic and redacts Resend API keys, SMTP passwords,
 * database URIs, email addresses, OTPs, reset tokens, and cookies.
 */
function sanitizeErrorForLog(err) {
  const source =
    err && typeof err === 'object'
      ? err.safeDiagnostic && typeof err.safeDiagnostic === 'object'
        ? { ...err, ...err.safeDiagnostic }
        : err
      : { message: String(err || 'Unknown server error') };

  const rawCode = String(source.code || source.name || 'INTERNAL_SERVER_ERROR');
  const rawOperation = String(source.operation || 'HTTP_REQUEST');
  const rawCategory = String(source.category || 'SERVER_ERROR');
  const rawMessage = String(source.message || 'Unknown server error');
  const rawProvider = source.provider ? String(source.provider).toLowerCase() : undefined;

  const diagnostic = {
    code: redactSensitiveText(rawCode) || 'INTERNAL_SERVER_ERROR',
    operation: redactSensitiveText(rawOperation) || 'HTTP_REQUEST',
    category: redactSensitiveText(rawCategory) || 'SERVER_ERROR',
    message: redactSensitiveText(rawMessage),
  };

  if (rawProvider === 'resend' || rawProvider === 'smtp' || rawProvider === 'unconfigured') {
    diagnostic.provider = rawProvider;
  }

  return diagnostic;
}

/**
 * Centralized application error handler middleware.
 * Ensures stack traces and sensitive error internals are never exposed in production.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = Number(err?.statusCode || err?.status) || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const sanitizedDiagnostic = sanitizeErrorForLog(err);

  const message = statusCode === 500 && isProduction
    ? 'Internal server error'
    : redactSensitiveText(err?.message || 'An unexpected error occurred');

  const response = {
    success: false,
    error: {
      message,
      statusCode,
      ...(err?.safeDiagnostic
        ? {
            code: sanitizedDiagnostic.code,
            operation: sanitizedDiagnostic.operation,
            category: sanitizedDiagnostic.category,
            ...(sanitizedDiagnostic.provider ? { provider: sanitizedDiagnostic.provider } : {}),
          }
        : {}),
    },
  };

  // Include stack trace only in development and test environments
  if (!isProduction && err?.stack) {
    response.error.stack = redactSensitiveText(err.stack);
  }

  // Log sanitized 5xx diagnostics on the server
  if (statusCode >= 500) {
    console.error(
      `[Error ${statusCode}] ${req.method} ${req.originalUrl}:`,
      sanitizedDiagnostic
    );
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
  sanitizeErrorForLog,
};
