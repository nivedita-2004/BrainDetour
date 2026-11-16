const express = require('express');
const mongoose = require('mongoose');
const { getEmailConfig } = require('../utils/mailer');

const router = express.Router();

/**
 * GET /api/health
 * Returns the operational status of the Express server, MongoDB connection,
 * and sanitized email provider and configuration status.
 * Never exposes credentials, sender details, SMTP host, or internal secrets.
 */
router.get('/health', (_req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const emailConfig = getEmailConfig();

  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'ok' : 'degraded',
    server: 'running',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: {
      status: isDbConnected ? 'connected' : 'disconnected',
    },
    email: {
      provider: emailConfig.isValidProvider ? emailConfig.provider : 'unconfigured',
      configured: Boolean(emailConfig.configured),
    },
  });
});

module.exports = router;
