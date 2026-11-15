const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// If started with a local override file (e.g. .env.local) that sets dummy @braindetour.local
// SMTP placeholders, fall back to the real EMAIL_* configuration in Backend/.env when present.
if (
  process.env.EMAIL_USER &&
  process.env.EMAIL_USER.trim().toLowerCase().endsWith('@braindetour.local') &&
  fs.existsSync(envPath)
) {
  try {
    const parsedEnv = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    if (
      parsedEnv.EMAIL_USER &&
      !parsedEnv.EMAIL_USER.trim().toLowerCase().endsWith('@braindetour.local')
    ) {
      for (const key of [
        'EMAIL_HOST',
        'EMAIL_PORT',
        'EMAIL_SECURE',
        'EMAIL_USER',
        'EMAIL_PASS',
        'EMAIL_FROM',
      ]) {
        if (parsedEnv[key] !== undefined) {
          process.env[key] = parsedEnv[key];
        }
      }
    }
  } catch (_err) {
    // Ignore fallback read errors
  }
}

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { verifyEmailTransport } = require('./src/utils/mailer');

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is missing in Backend/.env');
    }

    if (!process.env.ACCESS_TOKEN_SECRET && !process.env.JWT_SECRET) {
      throw new Error('ACCESS_TOKEN_SECRET is missing in Backend/.env');
    }

    if (!process.env.REFRESH_TOKEN_SECRET) {
      throw new Error('REFRESH_TOKEN_SECRET is missing in Backend/.env');
    }

    await connectDatabase(MONGODB_URI);

    app.listen(PORT, () => {
      console.log(`BrainDetour API running at http://localhost:${PORT}`);
      if (process.env.NODE_ENV !== 'test' && !process.send) {
        verifyEmailTransport().catch(() => {});
      }
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
