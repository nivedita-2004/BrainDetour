const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');

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
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
}

startServer();
