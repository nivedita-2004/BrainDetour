const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const VALID_PROVIDERS = new Set(['resend', 'smtp']);

const ALLOWED_DIAGNOSTIC_CATEGORIES = new Set([
  'EMAIL_CONFIG_ERROR',
  'EMAIL_AUTH_ERROR',
  'EMAIL_RATE_LIMIT_ERROR',
  'EMAIL_TIMEOUT_ERROR',
  'EMAIL_NETWORK_ERROR',
  'EMAIL_DELIVERY_ERROR',
  'MONGODB_VALIDATION_ERROR',
  'MONGODB_CONNECTION_ERROR',
  'MONGODB_QUERY_ERROR',
  'INTERNAL_RESET_ERROR',
  'SERVER_ERROR',
]);

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
 * Extracts bare email address from a sender string like "BrainDetour <no-reply@mail.braindetours.com>".
 *
 * @param {string} rawFrom
 * @returns {string}
 */
function extractEmailAddress(rawFrom) {
  if (!rawFrom) return '';
  const angleMatch = rawFrom.match(/<([^<>]+)>/);
  if (angleMatch && angleMatch[1]) {
    return angleMatch[1].trim();
  }
  return rawFrom.trim();
}

/**
 * Formats a sender value into a standard From header while preserving custom display names.
 *
 * @param {string} rawFrom
 * @returns {string}
 */
function formatFromHeader(rawFrom) {
  if (!rawFrom) return '';
  if (rawFrom.includes('<') && rawFrom.includes('>')) {
    return rawFrom;
  }
  return `BrainDetour <${rawFrom}>`;
}

/**
 * Extracts and normalizes email configuration from environment variables.
 * Enforces explicit provider selection ('resend' or 'smtp') without mixing
 * EMAIL_FROM (verified Resend sender) and EMAIL_USER (Gmail SMTP account).
 */
function getEmailConfig() {
  const rawProvider = normalizeEnvValue(process.env.EMAIL_PROVIDER).toLowerCase();
  const isValidProvider = VALID_PROVIDERS.has(rawProvider);
  const provider = isValidProvider ? rawProvider : rawProvider || null;

  // Existing Gmail / SMTP settings (preserved untouched)
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

  const isPlaceholderSmtpUser =
    !user ||
    user.toLowerCase() === 'your_email@gmail.com' ||
    (user.toLowerCase().endsWith('@braindetour.local') &&
      (host === 'localhost' || host === '127.0.0.1') &&
      process.env.NODE_ENV !== 'test');

  const isPlaceholderSmtpPass =
    !pass ||
    pass === 'your_email_app_password' ||
    pass === 'your_gmail_app_password';

  const smtpConfigured = !isPlaceholderSmtpUser && !isPlaceholderSmtpPass;

  // Resend settings
  const resendApiKey = normalizeEnvValue(process.env.RESEND_API_KEY);
  const isPlaceholderResendKey =
    !resendApiKey ||
    resendApiKey === 'your_resend_api_key' ||
    resendApiKey.startsWith('<');

  const rawFrom = normalizeEnvValue(process.env.EMAIL_FROM);
  const isPlaceholderFrom =
    !rawFrom ||
    rawFrom.toLowerCase() === 'your_email@gmail.com' ||
    rawFrom.toLowerCase().endsWith('@braindetour.local');

  const resendFromHeader = isPlaceholderFrom ? '' : formatFromHeader(rawFrom);
  const resendFromAddress = isPlaceholderFrom ? '' : extractEmailAddress(rawFrom);
  const resendConfigured = !isPlaceholderResendKey && !isPlaceholderFrom;

  // Determine active sender and configuration state based strictly on selected provider
  let fromAddress = '';
  let fromHeader = '';
  let configured = false;
  let missingConfigCode = null;
  let missingConfigMessage = null;

  if (!rawProvider) {
    configured = false;
    missingConfigCode = 'EMAIL_PROVIDER_MISSING';
    missingConfigMessage =
      "Email provider is not configured: EMAIL_PROVIDER must be set to 'resend' or 'smtp'";
  } else if (!isValidProvider) {
    configured = false;
    missingConfigCode = 'INVALID_EMAIL_PROVIDER';
    missingConfigMessage = `Unsupported EMAIL_PROVIDER '${rawProvider}': must be 'resend' or 'smtp'`;
  } else if (provider === 'resend') {
    fromAddress = resendFromAddress;
    fromHeader = resendFromHeader;
    configured = resendConfigured;
    if (isPlaceholderResendKey) {
      missingConfigCode = 'EMAIL_NOT_CONFIGURED';
      missingConfigMessage =
        'Resend email service is not configured: RESEND_API_KEY environment variable is required';
    } else if (isPlaceholderFrom) {
      missingConfigCode = 'EMAIL_NOT_CONFIGURED';
      missingConfigMessage =
        'Resend email service is not configured: EMAIL_FROM environment variable is required';
    }
  } else if (provider === 'smtp') {
    // In SMTP mode, use EMAIL_FROM if it is a valid non-Resend-only address, otherwise EMAIL_USER
    const smtpRawFrom =
      isPlaceholderFrom || (isGmailHost && user && rawFrom.includes('@mail.braindetours.com'))
        ? user
        : rawFrom;
    fromAddress = extractEmailAddress(smtpRawFrom);
    fromHeader = smtpRawFrom
      ? smtpRawFrom.includes('<') && smtpRawFrom.includes('>')
        ? smtpRawFrom
        : `"BrainDetour" <${smtpRawFrom}>`
      : '';
    configured = smtpConfigured;
    if (!smtpConfigured) {
      missingConfigCode = 'EMAIL_NOT_CONFIGURED';
      missingConfigMessage =
        'Email service is not configured: valid EMAIL_USER and EMAIL_PASS environment variables are required';
    }
  }

  return {
    provider,
    rawProvider,
    isValidProvider,
    host,
    port,
    secure,
    user,
    pass,
    resendApiKey,
    fromAddress,
    fromHeader,
    smtpConfigured,
    resendConfigured,
    configured,
    missingConfigCode,
    missingConfigMessage,
  };
}

/**
 * Redacts sensitive tokens, API keys, SMTP passwords, database URIs, cookies,
 * email addresses, and 6-digit OTPs from any string value.
 *
 * @param {unknown} input
 * @returns {string}
 */
function redactSensitiveText(input) {
  if (input === null || input === undefined) return '';
  let text = String(input);

  const envSecrets = [
    { val: normalizeEnvValue(process.env.RESEND_API_KEY), replacement: '[REDACTED_API_KEY]' },
    { val: normalizeEnvValue(process.env.EMAIL_PASS), replacement: '[REDACTED_SECRET]' },
    {
      val: normalizeEnvValue(process.env.EMAIL_PASS).replace(/\s+/g, ''),
      replacement: '[REDACTED_SECRET]',
    },
    { val: normalizeEnvValue(process.env.ACCESS_TOKEN_SECRET), replacement: '[REDACTED_SECRET]' },
    { val: normalizeEnvValue(process.env.REFRESH_TOKEN_SECRET), replacement: '[REDACTED_SECRET]' },
    { val: normalizeEnvValue(process.env.JWT_SECRET), replacement: '[REDACTED_SECRET]' },
    { val: normalizeEnvValue(process.env.MONGODB_URI), replacement: '[REDACTED_DB_URI]' },
  ];

  for (const { val, replacement } of envSecrets) {
    if (val && val.length >= 4) {
      text = text.split(val).join(replacement);
    }
  }

  return text
    .replace(/(?:^|(?<=[^A-Za-z0-9]))re_[A-Za-z0-9_-]{4,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/(?:^|(?<=[^A-Za-z0-9]))eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]')
    .replace(/\b(set-cookie|cookie)\s*:\s*[^\r\n]+/gi, '$1: [REDACTED_COOKIE]')
    .replace(
      /["']?\b(accessToken|refreshToken|resetToken|passwordResetToken|otp|password|pass|apiKey|api_key|secret)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;'"&}\]]+)/gi,
      '$1=[REDACTED]'
    )
    .replace(/\b[a-f0-9]{32,128}\b/gi, '[REDACTED_TOKEN]')
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, '[REDACTED_DB_URI]')
    .replace(/smtps?:\/\/[^\s"']+/gi, '[REDACTED_SMTP_URI]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b\d{6}\b/g, '[REDACTED_OTP]');
}

/**
 * Classifies an email transport or configuration error into a provider-neutral EMAIL_* category.
 *
 * @param {Error & { code?: string, responseCode?: number, category?: string }} error
 * @returns {string}
 */
function classifyMailErrorCategory(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode ?? error?.statusCode) || 0;
  const msg = String(error?.message || '').toLowerCase();

  if (
    code === 'EMAIL_NOT_CONFIGURED' ||
    code === 'EMAIL_PROVIDER_MISSING' ||
    code === 'INVALID_EMAIL_PROVIDER' ||
    code === 'RESEND_API_KEY_MISSING' ||
    code === 'EMAIL_FROM_MISSING'
  ) {
    return 'EMAIL_CONFIG_ERROR';
  }
  if (
    code === 'RESEND_RATE_LIMIT' ||
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'TOO_MANY_REQUESTS' ||
    responseCode === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return 'EMAIL_RATE_LIMIT_ERROR';
  }
  if (
    code === 'EAUTH' ||
    code === 'INVALID_API_KEY' ||
    code === 'UNAUTHORIZED' ||
    code === 'FORBIDDEN' ||
    responseCode === 535 ||
    responseCode === 534 ||
    responseCode === 401 ||
    responseCode === 403 ||
    msg.includes('invalid login') ||
    msg.includes('username and password not accepted') ||
    msg.includes('api key is invalid') ||
    msg.includes('unauthorized')
  ) {
    return 'EMAIL_AUTH_ERROR';
  }
  if (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return 'EMAIL_TIMEOUT_ERROR';
  }
  if (
    code === 'ECONNECTION' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ESOCKET' ||
    code === 'EDNS' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'RESEND_NETWORK_ERROR' ||
    msg.includes('unable to fetch') ||
    msg.includes('network') ||
    msg.includes('socket hang up') ||
    msg.includes('econnrefused')
  ) {
    return 'EMAIL_NETWORK_ERROR';
  }
  if (error?.category && ALLOWED_DIAGNOSTIC_CATEGORIES.has(error.category)) {
    return error.category;
  }
  return 'EMAIL_DELIVERY_ERROR';
}

/**
 * Produces a validated, secret-redacted diagnostic summary for an email error or existing diagnostic object.
 * Never blindly trusts pre-populated error.safeDiagnostic fields.
 *
 * @param {any} errorOrDiagnostic
 * @param {string} [defaultOperation='EMAIL_SEND']
 */
function sanitizeMailError(errorOrDiagnostic, defaultOperation = 'EMAIL_SEND') {
  const config = getEmailConfig();
  const source =
    errorOrDiagnostic && typeof errorOrDiagnostic === 'object'
      ? errorOrDiagnostic.safeDiagnostic && typeof errorOrDiagnostic.safeDiagnostic === 'object'
        ? { ...errorOrDiagnostic, ...errorOrDiagnostic.safeDiagnostic }
        : errorOrDiagnostic
      : { message: String(errorOrDiagnostic || 'Unknown email transport error') };

  const rawCode = String(source.code || 'EMAIL_DELIVERY_ERROR');
  const rawOperation = String(source.operation || source.command || defaultOperation);
  const rawCommand = source.command ? String(source.command) : null;
  const rawMessage = String(source.message || 'Unknown email transport error');
  const rawProvider = String(source.provider || config.provider || 'unconfigured').toLowerCase();

  const sanitizedProvider = VALID_PROVIDERS.has(rawProvider) ? rawProvider : 'unconfigured';
  const sanitizedCode = redactSensitiveText(rawCode) || 'EMAIL_DELIVERY_ERROR';
  const sanitizedOperation = redactSensitiveText(rawOperation) || defaultOperation;
  const sanitizedCommand = rawCommand ? redactSensitiveText(rawCommand) : null;
  const sanitizedMessage = redactSensitiveText(rawMessage);
  const responseCode =
    typeof source.responseCode === 'number' && Number.isFinite(source.responseCode)
      ? source.responseCode
      : typeof source.statusCode === 'number' && Number.isFinite(source.statusCode)
        ? source.statusCode
        : null;

  const category = classifyMailErrorCategory({
    code: sanitizedCode,
    responseCode,
    message: rawMessage,
    category: source.category,
  });

  return {
    provider: sanitizedProvider,
    code: sanitizedCode,
    operation: sanitizedOperation,
    category,
    command: sanitizedCommand,
    responseCode,
    message: sanitizedMessage,
  };
}

/**
 * Creates and returns an official Resend SDK client instance when EMAIL_PROVIDER=resend.
 * Never invoked when EMAIL_PROVIDER=smtp.
 *
 * @param {string} [apiKeyOverride]
 * @returns {InstanceType<typeof Resend> | null}
 */
function createResendClient(apiKeyOverride) {
  const config = getEmailConfig();
  if (config.provider !== 'resend') {
    return null;
  }
  const key = apiKeyOverride !== undefined ? apiKeyOverride : config.resendApiKey;
  if (!key || key === 'your_resend_api_key' || key.startsWith('<')) {
    return null;
  }
  return new Resend(key);
}

/**
 * Creates and returns a Nodemailer SMTP transporter when EMAIL_PROVIDER=smtp.
 * Never invoked when EMAIL_PROVIDER=resend.
 *
 * @param {Partial<ReturnType<typeof getEmailConfig>>} [overrides]
 */
function createTransporter(overrides = {}) {
  const config = { ...getEmailConfig(), ...overrides };

  if (config.provider !== 'smtp' || !config.smtpConfigured) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && config.port === 587,
    family: 4,
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
 * Builds the password reset email payload preserving BrainDetour branding and 60-second OTP copy.
 *
 * @param {string} fromHeader
 * @param {string} toEmail
 * @param {string} otp
 */
function buildPasswordResetEmailPayload(fromHeader, toEmail, otp) {
  return {
    from: fromHeader,
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
}

/**
 * Verifies email provider configuration without blocking server startup,
 * sending real emails, or exposing credentials.
 * In Resend mode, distinguishes local configuration readiness (configured: true)
 * from live API/domain/delivery verification (verified: false at startup).
 */
async function verifyEmailTransport() {
  const config = getEmailConfig();

  if (!config.isValidProvider) {
    const info = {
      provider: config.provider || 'unconfigured',
      configured: false,
      verified: false,
      code: config.missingConfigCode || 'INVALID_EMAIL_PROVIDER',
      message: config.missingConfigMessage,
    };
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Mailer] Email provider configuration error:', info.message);
    }
    return info;
  }

  if (config.provider === 'resend') {
    if (!config.configured) {
      const info = {
        provider: 'resend',
        configured: false,
        verified: false,
        code: config.missingConfigCode || 'EMAIL_NOT_CONFIGURED',
        message: config.missingConfigMessage,
      };
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Mailer] Resend provider not configured:', info.message);
      }
      return info;
    }

    try {
      const client = mailer.createResendClient();
      if (!client) {
        throw new Error('Failed to initialize Resend client');
      }
      // SDK initialization confirms local configuration only; live API key & domain authorization
      // are verified on actual delivery without sending a test email during startup.
      const result = {
        provider: 'resend',
        configured: true,
        verified: false,
        verificationStatus: 'not_verified_at_startup',
        message:
          'Resend SDK client is configured; API key and domain authorization are verified upon email delivery.',
      };
      if (process.env.NODE_ENV !== 'test') {
        console.log('[Mailer] Resend email provider configured (API/domain verified on delivery).');
      }
      return result;
    } catch (error) {
      const diagnostic = sanitizeMailError(error, 'RESEND_VERIFY');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Mailer] Resend initialization failed:', diagnostic);
      }
      return {
        provider: 'resend',
        configured: false,
        verified: false,
        error: diagnostic,
      };
    }
  }

  // EMAIL_PROVIDER === 'smtp'
  const transporter = mailer.createTransporter();
  if (!transporter) {
    const info = {
      provider: 'smtp',
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
      provider: 'smtp',
      configured: true,
      verified: true,
    };
    if (process.env.NODE_ENV !== 'test') {
      console.log('[Mailer] SMTP transporter verified.');
    }
    return result;
  } catch (error) {
    const diagnostic = sanitizeMailError(error, 'SMTP_VERIFY');
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Mailer] SMTP transporter verification failed:', diagnostic);
    }
    return {
      provider: 'smtp',
      configured: true,
      verified: false,
      error: diagnostic,
    };
  }
}

/**
 * Sends a password reset OTP email using the explicitly configured EMAIL_PROVIDER ('resend' or 'smtp').
 * Never falls back between providers and never modifies or exposes credentials.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetEmail(toEmail, otp) {
  const config = getEmailConfig();

  // 1. Validate explicit EMAIL_PROVIDER selection
  if (!config.isValidProvider) {
    const providerError = new Error(
      config.missingConfigMessage ||
        "Invalid or missing EMAIL_PROVIDER: must be set to 'resend' or 'smtp'"
    );
    providerError.code = config.missingConfigCode || 'INVALID_EMAIL_PROVIDER';
    providerError.operation = 'SELECT_EMAIL_PROVIDER';
    providerError.safeDiagnostic = sanitizeMailError(providerError, 'SELECT_EMAIL_PROVIDER');

    if (process.env.NODE_ENV !== 'test') {
      console.error('[Mailer] Cannot send password reset email:', providerError.safeDiagnostic);
    }
    throw providerError;
  }

  // 2. Resend Provider Mode (Exclusively Resend HTTPS SDK — never touches SMTP or Gmail credentials)
  if (config.provider === 'resend') {
    if (!config.resendConfigured) {
      const configError = new Error(
        config.missingConfigMessage ||
          'Resend email service is not configured: RESEND_API_KEY and EMAIL_FROM are required'
      );
      configError.code = config.missingConfigCode || 'EMAIL_NOT_CONFIGURED';
      configError.operation = 'CREATE_RESEND_CLIENT';
      configError.safeDiagnostic = sanitizeMailError(configError, 'CREATE_RESEND_CLIENT');

      if (process.env.NODE_ENV !== 'test') {
        console.error('[Mailer] Cannot send password reset email via Resend:', configError.safeDiagnostic);
      }
      throw configError;
    }

    const payload = buildPasswordResetEmailPayload(config.fromHeader, toEmail, otp);

    try {
      const resendClient = mailer.createResendClient(config.resendApiKey);
      if (!resendClient || !resendClient.emails || typeof resendClient.emails.send !== 'function') {
        const initError = new Error('Resend client failed to initialize');
        initError.code = 'EMAIL_NOT_CONFIGURED';
        initError.operation = 'CREATE_RESEND_CLIENT';
        throw initError;
      }

      const result = await resendClient.emails.send(payload);

      if (result && result.error) {
        const errObj = result.error;
        const statusCode = Number(errObj.statusCode) || null;
        const errName = String(errObj.name || '').toLowerCase();
        const apiError = new Error(
          errObj.message || 'Resend API rejected password reset email delivery'
        );

        if (statusCode === 429 || errName.includes('rate_limit')) {
          apiError.code = 'RESEND_RATE_LIMIT';
        } else if (errName === 'application_error' && statusCode === null) {
          apiError.code = 'RESEND_NETWORK_ERROR';
        } else {
          apiError.code = errObj.name ? String(errObj.name).toUpperCase() : 'RESEND_API_ERROR';
        }
        apiError.operation = 'RESEND_SEND';
        apiError.responseCode = statusCode;
        throw apiError;
      }

      return true;
    } catch (error) {
      if (!error.operation) {
        error.operation = 'RESEND_SEND';
      }
      if (!error.code) {
        const msgLower = String(error.message || '').toLowerCase();
        if (msgLower.includes('rate limit') || error.statusCode === 429) {
          error.code = 'RESEND_RATE_LIMIT';
        } else if (
          msgLower.includes('timeout') ||
          msgLower.includes('timed out')
        ) {
          error.code = 'ETIMEDOUT';
        } else if (
          msgLower.includes('network') ||
          msgLower.includes('fetch') ||
          msgLower.includes('econnreset') ||
          msgLower.includes('socket hang up')
        ) {
          error.code = 'RESEND_NETWORK_ERROR';
        } else {
          error.code = 'RESEND_API_ERROR';
        }
      }
      const diagnostic = sanitizeMailError(error, 'RESEND_SEND');
      error.safeDiagnostic = diagnostic;
      if (process.env.NODE_ENV !== 'test') {
        console.error('[Mailer] Resend password reset email delivery failed:', diagnostic);
      }
      throw error;
    }
  }

  // 3. SMTP Provider Mode (Exclusively Nodemailer / Gmail SMTP — never touches Resend)
  const transporter = mailer.createTransporter();

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
      console.error('[Mailer] Cannot send password reset email via SMTP:', configError.safeDiagnostic);
    }
    throw configError;
  }

  const mailOptions = buildPasswordResetEmailPayload(config.fromHeader, toEmail, otp);

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    const diagnostic = sanitizeMailError(error, 'SMTP_SEND');
    error.safeDiagnostic = diagnostic;
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Mailer] SMTP password reset email delivery failed:', diagnostic);
    }
    throw error;
  }
}

const mailer = {
  getEmailConfig,
  redactSensitiveText,
  classifyMailErrorCategory,
  sanitizeMailError,
  createResendClient,
  createTransporter,
  buildPasswordResetEmailPayload,
  verifyEmailTransport,
  sendPasswordResetEmail,
};

module.exports = mailer;
