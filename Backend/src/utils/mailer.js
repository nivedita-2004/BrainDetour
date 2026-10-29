const nodemailer = require('nodemailer');

/**
 * Creates and returns a Nodemailer transporter using environment settings.
 */
function createTransporter() {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_PORT) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass || user === 'your_email@gmail.com') {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Sends a password reset OTP email to the user.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetEmail(toEmail, otp) {
  const transporter = createTransporter();

  if (!transporter) {
    // In development/test mode without credentials configured, log notice without leaking in production
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Mailer] SMTP credentials not configured. Development OTP for ${toEmail}: ${otp}`);
      return true;
    }
    throw new Error('Email service is not configured');
  }

  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const mailOptions = {
    from: `"BrainDetour" <${fromEmail}>`,
    to: toEmail,
    subject: 'BrainDetour — Password Reset Verification Code',
    text: `Your password reset verification code is: ${otp}\n\nThis code is valid for 10 minutes and can only be used once.\nIf you did not request a password reset, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background: #fafafa;">
        <h2 style="color: #6366f1; margin-top: 0;">BrainDetour Password Reset</h2>
        <p>You requested to reset your password. Use the verification code below to proceed:</p>
        <div style="background: #ffffff; padding: 16px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1e1b4b; border: 1px dashed #6366f1; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in <strong>10 minutes</strong> and can only be used once.</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return true;
}

module.exports = {
  sendPasswordResetEmail,
};
