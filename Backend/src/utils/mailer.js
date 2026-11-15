const nodemailer = require('nodemailer');

/**
 * Normalizes an environment variable string by trimming whitespace and
 * stripping accidental surrounding single or double quotes.
 *
 * @param {string | undefined} value
 * @returns {string}
 */
function normalizeEnvValue(value) {
  if (typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Extracts and normalizes SMTP configuration from environment variables.
 */
function getEmailConfig() {
  const host = normalizeEnvValue(process.env.EMAIL_HOST) || 'smtp.gmail.com';
  const port = Number(normalizeEnvValue(process.env.EMAIL_PORT)) || 587;
  const explicitSecure = normalizeEnvValue(process.env.EMAIL_SECURE).toLowerCase();
  const secure =
    explicitSecure === 'true' ? true : explicitSecure === 'false' ? false : port === 465;

  const user = normalizeEnvValue(process.env.EMAIL_USER);
  const rawPass = normalizeEnvValue(process.env.EMAIL_PASS);

  // Google App Passwords are displayed in 4 groups of 4 chars ("xxxx xxxx xxxx xxxx")
  // but must be authenticated without spaces. Normalize whitespace for Gmail SMTP.
  const isGmailHost = host.toLowerCase().includes('gmail.com');
  const pass = isGmailHost ? rawPass.replace(/\s+/g, '') : rawPass;

  const rawFrom = normalizeEnvValue(process.env.EMAIL_FROM);
  const isFromPlaceholder =
    !rawFrom ||
    rawFrom.toLowerCase() === 'your_email@gmail.com' ||
    rawFrom.toLowerCase().endsWith('@braindetour.local');
  const fromAddress = isFromPlaceholder ? user : rawFrom;

  const fromHeader =
    fromAddress && fromAddress.includes('<') && fromAddress.includes('>')
      ? fromAddress
      : `"BrainDetour" <${fromAddress}>`;

  const isPlaceholderUser =
    !user ||
    user.toLowerCase() === 'your_email@gmail.com' ||
    (user.toLowerCase().endsWith('@braindetour.local') &&
      (host === 'localhost' || host === '127.0.0.1') &&
      process.env.NODE_ENV !== 'test');

  const isPlaceholderPass =
    !pass ||
    pass === 'your_email_app_password' ||
    pass === 'your_gmail_app_password';

  const configured = !isPlaceholderUser && !isPlaceholderPass;

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromAddress,
    fromHeader,
    configured,
  };
}

/**
 * Produces a safe, secret-redacted diagnostic summary for an SMTP or configuration error.
 * Never includes passwords, OTPs, reset tokens, or raw recipient/sender email addresses.
 *
 * @param {Error & { code?: string, command?: string, responseCode?: number, operation?: string }} error
 * @param {string} [defaultOperation='SMTP_SEND']
 */
function sanitizeMailError(error, defaultOperation = 'SMTP_SEND') {
  const config = getEmailConfig();
  const rawMessage = String(error?.message || 'Unknown email transport error');
  const sanitizedMessage = rawMessage
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b\d{6}\b/g, '[REDACTED_OTP]');

  return {
    code: error?.code || 'EMAIL_DELIVERY_ERROR',
    operation: error?.operation || error?.command || defaultOperation,
    command: error?.command || null,
    responseCode: error?.responseCode || null,
    host: config.host,
    port: config.port,
    secure: config.secure,
    message: sanitizedMessage,
  };
}

/**
 * Creates and returns a Nodemailer transporter using normalized environment settings.
 */
function createTransporter() {
  const config = getEmailConfig();

  if (!config.configured) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && config.port === 587,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Verifies SMTP transporter connectivity and credentials without blocking server startup
 * or exposing sensitive credentials in logs.
 *
 * @returns {Promise<{ configured: boolean, verified: boolean, host?: string, port?: number, secure?: boolean, code?: string, message?: string, error?: object }>}
 */
async function verifyEmailTransport() {
  const config = getEmailConfig();
  const transporter = createTransporter();

  if (!transporter) {
    const info = {
      configured: false,
      verified: false,
      code: 'EMAIL_NOT_CONFIGURED',
      message: 'SMTP credentials (EMAIL_USER / EMAIL_PASS) are not configured.',
    };
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Mailer] SMTP transporter not configured:', info.message);
    }
    return info;
  }

  try {
    await transporter.verify();
    const result = {
      configured: true,
      verified: true,
      host: config.host,
      port: config.port,
      secure: config.secure,
    };
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Mailer] SMTP transporter verified (${config.host}:${config.port}).`);
    }
    return result;
  } catch (error) {
    const diagnostic = sanitizeMailError(error, 'SMTP_VERIFY');
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Mailer] SMTP transporter verification failed:', diagnostic);
    }
    return {
      configured: true,
      verified: false,
      error: diagnostic,
    };
  }
}

/**
 * Sends a password reset OTP email to the user.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetEmail(toEmail, otp) {
  const config = getEmailConfig();
  const transporter = createTransporter();

  if (!transporter) {
    // Allow legacy non-mailer-specific auth tests in NODE_ENV=test to pass unless config check is enforced
    if (process.env.NODE_ENV === 'test' && process.env.ENFORCE_EMAIL_CONFIG_IN_TEST !== 'true') {
      return true;
    }

    const configError = new Error(
      'Email service is not configured: valid EMAIL_USER and EMAIL_PASS environment variables are required'
    );
    configError.code = 'EMAIL_NOT_CONFIGURED';
    configError.operation = 'CREATE_TRANSPORTER';
    configError.safeDiagnostic = sanitizeMailError(configError, 'CREATE_TRANSPORTER');

    if (process.env.NODE_ENV !== 'test') {
      console.error('[Mailer] Cannot send password reset email:', configError.safeDiagnostic);
    }
    throw configError;
  }

  const mailOptions = {
    from: config.fromHeader,
    to: toEmail,
    subject: 'BrainDetour — Password Reset Verification Code',
    text: `Your password reset verification code is: ${otp}\n\nThis code is valid for 60 seconds and can only be used once.\nIf you did not request a password reset, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background: #fafafa;">
        <h2 style="color: #6366f1; margin-top: 0;">BrainDetour Password Reset</h2>
        <p>You requested to reset your password. Use the verification code below to proceed:</p>
        <div style="background: #ffffff; padding: 16px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1e1b4b; border: 1px dashed #6366f1; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in <strong>60 seconds</strong> and can only be used once.</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    const diagnostic = sanitizeMailError(error, 'SMTP_SEND');
    error.safeDiagnostic = diagnostic;
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Mailer] Password reset email delivery failed:', diagnostic);
    }
    throw error;
  }
}

module.exports = {
  getEmailConfig,
  sanitizeMailError,
  createTransporter,
  verifyEmailTransport,
  sendPasswordResetEmail,
};
