# BrainDetour Backend

Backend API service for **BrainDetour** — Universal Curiosity, Learning, and AI Evidence Review Platform.

Built with **Node.js (CommonJS)**, **Express**, and **Mongoose (MongoDB)**.

---

## 1. Architecture & Design Principles

The application enforces a clean, modular structure:

- `server.js`: Root entry point that loads `.env`, connects to MongoDB, and starts the Express server.
- `src/app.js`: Express application configuration (security headers via Helmet, CORS origin isolation, JSON/cookie parsing, route mounting under `/api`, 404 handler, and centralized error handling).
- `src/config/database.js`: Simplified Mongoose connection manager with DNS resolution settings.
- `src/models/User.js`: User Mongoose schema with secure hash fields, single-session refresh token hash, and password-reset OTP management.
- `src/models/Topic.js`: Topic schema representing curiosity topics across the 10 supported wheel categories.
- `src/models/ResearchSource.js`: Research source schema linking reviewed academic and publisher citations to topics.
- `src/models/LearningSession.js`: Learning session and reflection schema tracking user topic exploration and personal notes.
- `src/controllers/authController.js`: Handlers for signup, login, refresh, logout, getMe, forgotPassword, and resetPassword.
- `src/controllers/topicController.js`: Handlers for topic listing, random topic discovery, topic detail by slug, and research source lookup.
- `src/controllers/learningController.js`: Handlers for starting sessions, personal learning history, reflection updates, and session completion.
- `src/services/researchService.js`: Straightforward data access service for retrieving research sources from MongoDB.
- `src/middleware/authMiddleware.js`: JWT access token verification middleware protecting authenticated routes (`requireAuth`).
- `src/middleware/rateLimiters.js`: Rate limiters protecting login and password reset routes against brute-force attacks.
- `src/utils/tokens.js`: JWT creation, SHA-256 token hashing, and HttpOnly cookie management.
- `src/utils/mailer.js`: Nodemailer service for delivering 6-digit verification codes for password resets.
- `src/routes/authRoutes.js`: Authentication routes mounted under `/api/auth`.
- `src/routes/topicRoutes.js`: Public read-only topic and research routes mounted under `/api/topics`.
- `src/routes/learningRoutes.js`: Authenticated learning history & reflection routes mounted under `/api/learning`.
- `src/routes/healthRoutes.js`: System health endpoint (`/api/health`) reporting server status and live MongoDB connection state.
- `src/middleware/errorHandler.js`: Centralized error handling and standard JSON 404 responses.
- `scripts/seedTopics.js`: Idempotent seeding script for the 10 canonical categories, sample topics, and unreviewed research sources.

---

## 2. Environment Configuration

Copy the example environment configuration to create your local `.env`:

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | HTTP listener port | `5000` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `CLIENT_ORIGIN` | Allowed CORS origin of frontend app | `http://localhost:5173` |
| `MONGODB_URI` | MongoDB connection URI | `mongodb+srv://...` |
| `ACCESS_TOKEN_SECRET` | Secret key for 7-minute access tokens | *(secure random string)* |
| `REFRESH_TOKEN_SECRET` | Secret key for 15-day refresh tokens | *(secure random string)* |
| `EMAIL_HOST` | SMTP server host | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP server port | `587` |
| `EMAIL_USER` | Email account username / address | `your_email@gmail.com` |
| `EMAIL_PASS` | Email account password or Google App Password | `your_email_app_password` |
| `EMAIL_FROM` | Sender display email | `your_email@gmail.com` |

---

## 3. Database Seeding

To seed the 10 canonical wheel categories with sample topics and academic research citations idempotently into MongoDB:

```bash
npm run seed:topics
```

- Safe to run multiple times: skips topics and sources that already exist without creating duplicates.
- Never modifies or deletes user accounts or learning history.

---

## 4. API Endpoints

### A. Topic & Research Endpoints (Public — No Login Required)

Mounted under `/api/topics`:

| Method | Endpoint | Query / Param | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/topics` | `?category=Science` *(optional)* | Returns all active topics. Returns 400 for invalid category. |
| `GET` | `/api/topics/random` | `?category=Science` *(optional)* | Returns one randomly selected active topic. Returns 404 if none found. |
| `GET` | `/api/topics/:slug` | `:slug` | Returns topic details for the specified slug. Returns 404 if not found or inactive. |
| `GET` | `/api/topics/:slug/sources` | `:slug` | Returns reviewed research sources (URL, publisher, summary, sourceType, verification status). |

### B. Learning History & Reflections (Protected — Requires Authentication)

Mounted under `/api/learning`:

| Method | Endpoint | Request Body | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/learning/sessions` | `{"topicId": "MONGODB_TOPIC_ID"}` | Starts a new learning session with status `in_progress`. Returns 201 with populated topic. |
| `GET` | `/api/learning/history` | `?page=1&limit=10` *(optional)* | Returns paginated learning sessions belonging strictly to the authenticated user. Max limit 50. |
| `GET` | `/api/learning/sessions/:id` | *(None)* | Returns single session details belonging to the authenticated user. Returns 404 if not found or belongs to another user. |
| `PATCH` | `/api/learning/sessions/:id/reflection` | `{"whatILearned": "...", "whatSurprisedMe": "...", "myOpinion": "...", "questionsRemaining": "..."}` | Partially updates one or more reflection fields (strings up to 5000 chars) without overwriting other fields. |
| `PATCH` | `/api/learning/sessions/:id/complete` | *(None)* | Marks session as `completed`, sets `completedAt`, and calculates `durationSeconds`. Idempotent. |

### C. Authentication Endpoints

Mounted under `/api/auth`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Registers new user, sets `accessToken` and `refreshToken` HttpOnly cookies. |
| `POST` | `/api/auth/login` | Authenticates credentials, rate-limited, sets tokens in cookies. |
| `POST` | `/api/auth/refresh` | Atomically rotates refresh token, issues new 7m access token and 15d refresh token. |
| `POST` | `/api/auth/logout` | Clears refresh token in DB and clears both cookies. |
| `GET` | `/api/auth/me` | Protected route. Returns current user details. |
| `POST` | `/api/auth/forgot-password` | Delivers 6-digit verification code via email. Single-use, expires in 10 minutes. |
| `POST` | `/api/auth/reset-password` | Verifies OTP and updates password, invalidating existing refresh sessions. |

### D. System Health

- **Route:** `GET /api/health`
- **Response:** `200 OK` (when MongoDB connected) or `503 Service Unavailable`.

---

## 5. Running Tests

```bash
npm test
```

All 50 unit and integration tests run using the Node.js built-in test runner (`node:test`) and an in-memory MongoDB replica.
