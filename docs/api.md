# BrainDetour API Reference & Endpoints Specification

This document provides a comprehensive inventory and specification of all API endpoints implemented across the BrainDetour application (`Backend/` and `Frontend/`).

---

## 1. Architecture & Protocol Overview

- **Backend Platform:** Node.js, Express.js (v5), MongoDB with Mongoose (v9).
- **Frontend Platform:** React 19, Vite (v8), React Router 7, Axios (v1).
- **Production Backend URL:** `https://braindetour.onrender.com`
- **Base Route Prefix:** `/api`
- **Frontend Development Proxy:** `http://localhost:5173/api` &rarr; `http://localhost:5000/api`
- **Cross-Origin & Credentials:** CORS enabled with `credentials: true`. All authenticated sessions rely on secure `HttpOnly` cookies (`accessToken`, `refreshToken`) with fallback support for standard `Authorization: Bearer <token>` headers.
- **AI Integration:** Google Gemini API (`@google/genai`) for speech-to-text transcription, epistemic reasoning analysis, argument evaluation, and dynamic topic replenishment.

---

## 2. Global Endpoint Directory

| Domain | HTTP Method | Endpoint | Authentication | Rate Limited | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **System** | `GET` | `/api/health` | Public | No | Server operational status and MongoDB connection state |
| **Auth** | `POST` | `/api/auth/signup` | Public | No | Create scholar account and issue auth cookies |
| **Auth** | `POST` | `/api/auth/login` | Public | Yes (5 / 15m) | Authenticate user, issue JWTs, and set auth cookies |
| **Auth** | `POST` | `/api/auth/refresh` | Cookie (`refreshToken`) | No | Atomic refresh token rotation & new access token issuance |
| **Auth** | `POST` | `/api/auth/logout` | Public | No | Invalidate refresh token in database & clear cookies |
| **Auth** | `GET` | `/api/auth/me` | Required | No | Retrieve profile of the currently authenticated user |
| **Auth** | `POST` | `/api/auth/forgot-password` | Public | Yes (3 / 60m) | Generate 6-digit OTP code and send recovery email |
| **Auth** | `POST` | `/api/auth/reset-password` | Public | Yes (3 / 60m) | Verify OTP, reset password, and invalidate old sessions |
| **Topics** | `GET` | `/api/topics` | Public | No | List all active topics (supports category filter) |
| **Topics** | `GET` | `/api/topics/random` | Public / Optional User | No | Random non-repeating topic selection with `$sample` |
| **Topics** | `GET` | `/api/topics/:slug` | Public | No | Fetch topic details by slug or identifier |
| **Topics** | `GET` | `/api/topics/:slug/sources` | Public | No | Retrieve reviewed research sources for a topic |
| **Learning** | `POST` | `/api/learning/sessions` | Required | No | Start or resume an in-progress learning session |
| **Learning** | `GET` | `/api/learning/history` | Required | No | Paginated learning history for the authenticated user |
| **Learning** | `GET` | `/api/learning/sessions/by-topic/:topicId` | Required | No | Get the latest learning session for a specific topic |
| **Learning** | `GET` | `/api/learning/sessions/:id` | Required | No | Retrieve a single learning session by ObjectId |
| **Learning** | `PATCH` | `/api/learning/sessions/:id/reflection` | Required | No | Save/update partial reflection fields (`whatILearned`, etc.) |
| **Learning** | `PATCH` | `/api/learning/sessions/:id/complete` | Required | No | Mark learning session complete and record duration |
| **Speech** | `POST` | `/api/speech/sessions` | Required | Yes (30 / 15m) | Initialize speech rehearsal session for topic & duration |
| **Speech** | `POST` | `/api/speech/sessions/:id/complete` | Required | Yes (30 / 15m) | Upload recorded audio/transcript & trigger Gemini analysis |
| **Speech** | `GET` | `/api/speech/sessions/:id` | Required | No | Polling & retrieval of session state and AI feedback report |
| **Speech** | `GET` | `/api/speech/history` | Required | No | Paginated speech rehearsal history for authenticated user |
| **Speech** | `POST` | `/api/speech/sessions/:id/retry-analysis`| Required | Yes (30 / 15m) | Re-attempt failed Gemini analysis using preserved audio |

---

## 3. Detailed Endpoint Specifications

### 3.1. System & Health

#### `GET /api/health`
Checks server uptime and active database connectivity.

- **Headers:** None required
- **Response (200 OK — Connected):**
  ```json
  {
    "status": "ok",
    "server": "running",
    "timestamp": "2026-10-31T15:30:00.000Z",
    "uptime": 1420,
    "database": {
      "status": "connected"
    }
  }
  ```
- **Response (503 Service Unavailable — Database disconnected):**
  ```json
  {
    "status": "degraded",
    "server": "running",
    "timestamp": "2026-10-31T15:30:00.000Z",
    "uptime": 1420,
    "database": {
      "status": "disconnected"
    }
  }
  ```

---

### 3.2. Authentication & Identity (`/api/auth`)

Mounted at `/api/auth` via `Backend/src/routes/authRoutes.js` and handled by `Backend/src/controllers/authController.js`.

#### `POST /api/auth/signup`
Creates a new scholar account and automatically sets authentication cookies.

- **Request Body (`application/json`):**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Validation Rules:**
  - `name`: Required string.
  - `email`: Required, valid email format (normalized to lowercase).
  - `password`: Required, minimum 8 characters.
- **Cookies Issued:**
  - `accessToken`: HttpOnly, 7 minutes lifespan (`Secure`, `SameSite: None` in production).
  - `refreshToken`: HttpOnly, 15 days lifespan (`Secure`, `SameSite: None` in production).
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "user": {
      "_id": "671cc81a14b9c1d5f2a1b901",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-10-25T08:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing fields or password under 8 characters.
  - `409 Conflict`: An account with this email already exists.

---

#### `POST /api/auth/login`
Authenticates existing users with email and password. Protected by `loginLimiter` (5 attempts per 15 min).

- **Request Body (`application/json`):**
  ```json
  {
    "email": "jane@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Cookies Issued:** `accessToken`, `refreshToken`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Logged in successfully",
    "user": {
      "_id": "671cc81a14b9c1d5f2a1b901",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-10-25T08:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Email or password omitted.
  - `401 Unauthorized`: Invalid credentials.
  - `429 Too Many Requests`: Rate limit exceeded.

---

#### `POST /api/auth/refresh`
Performs atomic refresh token rotation. Requires the current `refreshToken` cookie.

- **Request Headers / Cookies:** Cookie header containing `refreshToken=<jwt>`.
- **Mechanics:** Verifies the cryptographic signature, matches the SHA-256 hash in MongoDB, atomically rotates the stored token hash, and issues fresh `accessToken` and `refreshToken` cookies.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Tokens refreshed successfully",
    "user": {
      "_id": "671cc81a14b9c1d5f2a1b901",
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Missing, expired, invalid, or already-reused refresh token. Automatically clears cookies.

---

#### `POST /api/auth/logout`
Invalidates the stored refresh token hash in MongoDB and clears authentication cookies.

- **Request Cookies:** `refreshToken=<jwt>` (optional; clears cookies regardless).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

---

#### `GET /api/auth/me`
Returns the profile object of the currently authenticated scholar.

- **Authentication:** Required (`requireAuth` middleware).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "user": {
      "_id": "671cc81a14b9c1d5f2a1b901",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-10-25T08:00:00.000Z",
      "updatedAt": "2026-10-25T08:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `401 Unauthorized`: Missing, invalid, or expired access token.

---

#### `POST /api/auth/forgot-password`
Initiates password recovery by emailing a 6-digit OTP verification code. Protected by `passwordResetLimiter` (3 requests / 60 min) and a 60-second cooldown per user.

- **Request Body (`application/json`):**
  ```json
  {
    "email": "jane@example.com"
  }
  ```
- **Response (200 OK):** Generic response to prevent email enumeration.
  ```json
  {
    "success": true,
    "message": "If an account exists with this email, a reset verification code has been sent."
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Email omitted.
  - `429 Too Many Requests`: 60-second cooldown or hourly rate limit triggered.

---

#### `POST /api/auth/reset-password`
Validates the emailed 6-digit OTP code, sets a new password, and invalidates all existing sessions.

- **Request Body (`application/json`):**
  ```json
  {
    "email": "jane@example.com",
    "otp": "481920",
    "newPassword": "BrandNewPassword2026!"
  }
  ```
- **Validation Rules:**
  - `otp`: Exactly 6 digits. Maximum 5 incorrect verification attempts.
  - `newPassword`: Minimum 8 characters.
  - Expiration: OTP expires after 10 minutes.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Password reset successful. Please log in with your new password."
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Invalid OTP, expired OTP, or too many incorrect attempts.

---

### 3.3. Topic Discovery & Inquiry (`/api/topics`)

Mounted at `/api/topics` via `Backend/src/routes/topicRoutes.js` and handled by `Backend/src/controllers/topicController.js`.

#### `GET /api/topics`
Retrieves all active curiosity topics, optionally filtered by genre.

- **Query Parameters:**
  - `category` *(optional)*: Topic category (`Philosophy`, `Science`, `Psychology`, `History`, `Technology`, `Art`, `Economics`, `Culture`, `Nature`, `Curious`, or `All`).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "count": 503,
    "topics": [
      {
        "_id": "671cc81a14b9c1d5f2a1ba01",
        "title": "The Strange Case of the Authorial Disclaimer",
        "slug": "strange-case-authorial-disclaimer",
        "category": "Culture",
        "description": "How a 1934 libel lawsuit against MGM gave birth to cinema's most famous legal disclaimer.",
        "source": "seed",
        "createdAt": "2026-10-25T08:00:00.000Z"
      }
    ]
  }
  ```

---

#### `GET /api/topics/random`
Retrieves a single random topic using MongoDB aggregation (`$sample`), actively avoiding recently viewed topics for the authenticated user or guest session.

- **Query Parameters:**
  - `category` *(optional)*: Restrict random selection to a specific category.
  - `exclude` *(optional)*: Specific topic ObjectId to exclude from results.
- **Behavior:**
  - Tracks user impressions via `TopicImpression` collection with a 7-day TTL index.
  - Issues a `braindetour_anon_id` cookie for anonymous visitors.
  - Implements progressive relaxation: if all topics in a category have been seen, excludes only the most recent impression to avoid back-to-back duplicate spins.
  - Automatically triggers background topic generation refill if category pool falls below target.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "topic": {
      "_id": "671cc81a14b9c1d5f2a1ba44",
      "id": "671cc81a14b9c1d5f2a1ba44",
      "title": "Why We Form Habits Around Friction",
      "slug": "why-we-form-habits-around-friction",
      "category": "Psychology",
      "description": "How behavioral obstacles can ironically solidify human routines.",
      "createdAt": "2026-10-25T08:00:00.000Z"
    }
  }
  ```

---

#### `GET /api/topics/:slug`
Fetches a single topic by its kebab-case slug or identifier.

- **Path Parameters:**
  - `slug`: String topic slug (e.g. `strange-case-authorial-disclaimer`).
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "topic": {
      "_id": "671cc81a14b9c1d5f2a1ba01",
      "title": "The Strange Case of the Authorial Disclaimer",
      "slug": "strange-case-authorial-disclaimer",
      "category": "Culture",
      "description": "How a 1934 libel lawsuit against MGM gave birth to cinema's most famous legal disclaimer.",
      "source": "seed",
      "createdAt": "2026-10-25T08:00:00.000Z",
      "updatedAt": "2026-10-25T08:00:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `404 Not Found`: Topic slug does not match any active topic.

---

#### `GET /api/topics/:slug/sources`
Retrieves curated research and academic sources associated with a topic.

- **Path Parameters:**
  - `slug`: String topic slug.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "topic": {
      "id": "671cc81a14b9c1d5f2a1ba01",
      "title": "The Strange Case of the Authorial Disclaimer",
      "slug": "strange-case-authorial-disclaimer",
      "category": "Culture"
    },
    "count": 2,
    "sources": [
      {
        "_id": "671cc81a14b9c1d5f2a1bb10",
        "title": "Youssoupoff v. Metro-Goldwyn-Mayer Pictures Ltd.",
        "authors": ["Court of Appeal of England and Wales"],
        "publicationYear": 1934,
        "sourceType": "case_law",
        "url": "https://en.wikipedia.org/wiki/Youssoupoff_v_Metro-Goldwyn-Mayer_Pictures_Ltd",
        "summary": "The landmark defamation case that led studios to include disclaimers."
      }
    ]
  }
  ```

---

### 3.4. Learning Reflections & Sessions (`/api/learning`)

Mounted at `/api/learning` via `Backend/src/routes/learningRoutes.js` and handled by `Backend/src/controllers/learningController.js`. All endpoints require authentication.

#### `POST /api/learning/sessions`
Starts a new learning session for a topic or resumes an active in-progress session.

- **Authentication:** Required.
- **Request Body (`application/json`):**
  ```json
  {
    "topicId": "671cc81a14b9c1d5f2a1ba01"
  }
  ```
  *(Accepts MongoDB ObjectId or topic slug string).*
- **Response (201 Created — New Session):**
  ```json
  {
    "success": true,
    "message": "Learning session started successfully",
    "session": {
      "_id": "671cc90a14b9c1d5f2a1bc22",
      "user": "671cc81a14b9c1d5f2a1b901",
      "topic": {
        "_id": "671cc81a14b9c1d5f2a1ba01",
        "title": "The Strange Case of the Authorial Disclaimer",
        "slug": "strange-case-authorial-disclaimer",
        "category": "Culture"
      },
      "status": "in_progress",
      "reflection": {},
      "startedAt": "2026-10-31T15:00:00.000Z"
    }
  }
  ```
- **Response (200 OK — Resumed In-Progress Session):**
  ```json
  {
    "success": true,
    "message": "Resumed existing in-progress learning session",
    "session": { /* existing session object */ },
    "resumed": true
  }
  ```

---

#### `GET /api/learning/history`
Returns a paginated log of previous learning sessions for the signed-in user.

- **Authentication:** Required.
- **Query Parameters:**
  - `page` *(optional, default: 1)*
  - `limit` *(optional, default: 10, max: 50)*
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "count": 5,
    "total": 12,
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalPages": 2
    },
    "sessions": [
      {
        "_id": "671cc90a14b9c1d5f2a1bc22",
        "topic": {
          "_id": "671cc81a14b9c1d5f2a1ba01",
          "title": "The Strange Case of the Authorial Disclaimer",
          "slug": "strange-case-authorial-disclaimer",
          "category": "Culture"
        },
        "status": "completed",
        "durationSeconds": 480,
        "startedAt": "2026-10-31T14:00:00.000Z",
        "completedAt": "2026-10-31T14:08:00.000Z"
      }
    ]
  }
  ```

---

#### `GET /api/learning/sessions/by-topic/:topicId`
Retrieves the most recent learning session for a specific topic.

- **Authentication:** Required.
- **Path Parameters:**
  - `topicId`: Topic ObjectId or slug.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "session": {
      "_id": "671cc90a14b9c1d5f2a1bc22",
      "topic": { /* topic details */ },
      "status": "in_progress",
      "reflection": {
        "whatILearned": "The Rasputin assassination lawsuit prompted MGM to insert the disclaimer."
      }
    }
  }
  ```
  *(Returns `"session": null` if user has never started a session for this topic).*

---

#### `GET /api/learning/sessions/:id`
Retrieves a specific learning session by its ObjectId. Enforces strict user ownership.

- **Authentication:** Required.
- **Path Parameters:**
  - `id`: Session ObjectId.
- **Response (200 OK):** `{ "success": true, "session": { ... } }`
- **Error Responses:**
  - `404 Not Found`: Session does not exist or belongs to another user.

---

#### `PATCH /api/learning/sessions/:id/reflection`
Persists user reflections. Supports partial updates (modifying one field without overwriting other reflection fields).

- **Authentication:** Required.
- **Path Parameters:**
  - `id`: Session ObjectId.
- **Request Body (`application/json`):**
  ```json
  {
    "whatILearned": "MGM lost a major libel suit against Prince Youssoupoff.",
    "whatSurprisedMe": "The disclaimer became standard studio boilerplate almost overnight.",
    "myOpinion": "Legal defenses often drive popular film conventions.",
    "questionsRemaining": "How do modern docudramas navigate this line today?"
  }
  ```
  *(Any subset of these 4 fields is accepted. Maximum 5000 characters per field).*
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Reflection updated successfully",
    "session": { /* updated session */ }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Empty body or unrecognized field keys.
  - `404 Not Found`: Session not found or unauthorized.

---

#### `PATCH /api/learning/sessions/:id/complete`
Marks a learning session as completed and computes total elapsed study time.

- **Authentication:** Required.
- **Path Parameters:**
  - `id`: Session ObjectId.
- **Request Body (`application/json`):**
  ```json
  {
    "durationSeconds": 620
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Learning session completed successfully",
    "session": {
      "_id": "671cc90a14b9c1d5f2a1bc22",
      "status": "completed",
      "durationSeconds": 620,
      "completedAt": "2026-10-31T15:10:20.000Z"
    }
  }
  ```
  *(Idempotent: if already completed, returns existing session without altering `completedAt`).*

---

### 3.5. Speech Lab & AI Speech Coach (`/api/speech`)

Mounted at `/api/speech` via `Backend/src/routes/speechRoutes.js` and handled by `Backend/src/controllers/speechController.js`. All endpoints require authentication.

#### `POST /api/speech/sessions`
Initializes a new speech practice session. Rate limited to 30 requests per 15 minutes.

- **Authentication:** Required.
- **Request Body (`application/json`):**
  ```json
  {
    "topicId": "671cc81a14b9c1d5f2a1ba01",
    "durationMinutes": 5
  }
  ```
- **Validation Rules:**
  - `topicId`: Required string (ObjectId or kebab-case slug).
  - `durationMinutes`: Number, must be `5`, `10`, or `15`.
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "session": {
      "_id": "671cca1b14b9c1d5f2a1bd33",
      "user": "671cc81a14b9c1d5f2a1b901",
      "topic": {
        "_id": "671cc81a14b9c1d5f2a1ba01",
        "title": "The Strange Case of the Authorial Disclaimer",
        "category": "Culture",
        "description": "How a 1934 libel lawsuit against MGM gave birth to cinema's most famous legal disclaimer."
      },
      "durationMinutes": 5,
      "status": "in_progress",
      "startedAt": "2026-10-31T15:15:00.000Z"
    }
  }
  ```
- **Concurrency Safeguard:** If a session for the same topic was created within the last 15 seconds, the server returns the existing session with `resumed: true` to prevent accidental double-clicks.

---

#### `POST /api/speech/sessions/:id/complete`
Uploads recorded presentation audio (or transcript) to finalize capture and triggers background Gemini AI reasoning analysis.

- **Authentication:** Required.
- **Path Parameters:**
  - `id`: Session ObjectId.
- **Content-Type:** `multipart/form-data` or `application/json`
- **Multipart Form Payload:**
  - `audio`: Audio file blob (`audio/webm`, `audio/ogg`, `audio/wav`, `audio/mp4`, `audio/mpeg`, etc.; max 50MB).
  - `actualDurationSeconds`: Integer seconds elapsed.
  - `transcript` *(optional)*: Text string fallback if speech-to-text was generated locally.
- **Behavior:**
  - Validates audio size (rejects empty/corrupted recordings `< 500` bytes).
  - Stores temporary audio file in `Backend/uploads/temp/` with a 2-hour retention window for retry resilience.
  - Transitions session status to `processing`.
  - Dispatches `processSpeechAnalysisAsync` background worker and immediately returns HTTP `202 Accepted` so client is never blocked.
- **Response (202 Accepted):**
  ```json
  {
    "success": true,
    "message": "Audio received and analysis started. Check status by polling.",
    "session": {
      "_id": "671cca1b14b9c1d5f2a1bd33",
      "status": "processing",
      "actualDurationSeconds": 240,
      "completedAt": "2026-10-31T15:19:00.000Z"
    }
  }
  ```

---

#### `GET /api/speech/sessions/:id`
Retrieves speech session status and Gemini AI feedback report. Polled by frontend until status is `completed` or `failed`.

- **Authentication:** Required.
- **Path Parameters:**
  - `id`: Session ObjectId.
- **Response (200 OK — In Progress / Processing):**
  ```json
  {
    "success": true,
    "session": {
      "_id": "671cca1b14b9c1d5f2a1bd33",
      "status": "processing"
    }
  }
  ```
- **Response (200 OK — Completed Analysis):**
  ```json
  {
    "success": true,
    "session": {
      "_id": "671cca1b14b9c1d5f2a1bd33",
      "status": "completed",
      "durationMinutes": 5,
      "actualDurationSeconds": 245,
      "transcript": "Today I will discuss the origin of the authorial disclaimer...",
      "analysis": {
        "overallScore": 84,
        "executiveSummary": "A well-structured presentation that effectively tied historical legal precedent to modern film production.",
        "epistemicMetrics": {
          "argumentProgression": 85,
          "empiricalEvidence": 80,
          "conceptualClarity": 88,
          "rhetoricalPacing": 82
        },
        "strengths": [
          "Clear chronological structure from the 1934 trial to current Hollywood standards.",
          "Accurate factual distinction between defamation and artistic parody."
        ],
        "areasForImprovement": [
          "Could cite specific modern legal statutes beyond the initial MGM case.",
          "Pacing slowed slightly during the transition between historical background and the conclusion."
        ],
        "strongerAnswer": {
          "structure": "1. Hook -> 2. The Youssoupoff Precedent -> 3. Contractual Transformation -> 4. Modern Implications",
          "exampleRewrite": "In 1934, MGM learned a \$125,000 lesson in character identification..."
        }
      },
      "completedAt": "2026-10-31T15:19:15.000Z"
    }
  }
  ```
- **Response (200 OK — Failed Analysis):**
  ```json
  {
    "success": true,
    "session": {
      "_id": "671cca1b14b9c1d5f2a1bd33",
      "status": "failed",
      "failureReason": "Audio was inaudible or background noise prevented accurate transcription."
    }
  }
  ```

---

#### `GET /api/speech/history`
Retrieves paginated presentation history for the logged-in scholar.

- **Authentication:** Required.
- **Query Parameters:**
  - `page` *(optional, default: 1)*
  - `limit` *(optional, default: 10, max: 50)*
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "sessions": [
      {
        "_id": "671cca1b14b9c1d5f2a1bd33",
        "topic": {
          "_id": "671cc81a14b9c1d5f2a1ba01",
          "title": "The Strange Case of the Authorial Disclaimer",
          "category": "Culture",
          "slug": "strange-case-authorial-disclaimer"
        },
        "status": "completed",
        "durationMinutes": 5,
        "actualDurationSeconds": 245,
        "createdAt": "2026-10-31T15:15:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 8,
      "totalPages": 1
    }
  }
  ```

---

#### `POST /api/speech/sessions/:id/retry-analysis`
Safely retries a failed Gemini evaluation without requiring the user to re-record their speech.

- **Authentication:** Required.
- **Path Parameters:**
  - `id`: Session ObjectId.
- **Mechanics:**
  - Reuses the original audio file retained in `Backend/uploads/temp/` (or stored transcript).
  - Uses atomic MongoDB locking (`findOneAndUpdate({ _id, status: 'failed' })`) to prevent duplicate concurrent retries.
  - Automatically preserves completed reports (`432/200` status).
- **Response (202 Accepted):**
  ```json
  {
    "success": true,
    "message": "Analysis retry initiated. Check status by polling.",
    "session": {
      "_id": "671cca1b14b9c1d5f2a1bd33",
      "status": "processing"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Session is not in `failed` status or audio file is no longer on disk.
  - `409 Conflict`: Retry is already actively processing.

---

## 4. Frontend API Consumer Layer

The frontend application communicates with the backend through modular services located in `Frontend/src/services/` and `Frontend/src/context/`:

```
Frontend/src/
├── services/
│   ├── api.js                   # Centralized Axios client (baseURL, path normalization, 401 refresh queue)
│   ├── learningApiService.js    # Learning sessions and reflection endpoints
│   ├── speechApiService.js      # Speech practice sessions, uploads, polling, history
│   └── mock/                    # Asynchronous mock fallback services for development & tests
│       ├── authService.js
│       ├── blogService.js
│       ├── reflectionService.js
│       ├── researchService.js
│       ├── speechPracticeService.js
│       └── topicService.js
├── context/
│   └── AuthProvider.jsx         # Context provider for user state, login, signup, proactive token refresh
└── pages/
    └── TopicPage.jsx            # Direct topic lookup integration (/api/topics/:slug)
```

### 4.1. Centralized Axios Client (`Frontend/src/services/api.js`)

- **Environment Variable:** `import.meta.env.VITE_API_BASE_URL`
  - **Local Development:** Unset or empty &rarr; requests use relative `/api/...` paths proxied by Vite (`http://localhost:5000`).
  - **Production Deployment:** Set to `https://braindetour.onrender.com` &rarr; requests route directly to Render.
- **Request Interceptor:**
  - Strips accidental `/api/api` duplicates.
  - Automatically prepends `/api` if missing from relative endpoints.
  - Removes manual `Content-Type` on `FormData` payloads so the browser can calculate the correct multipart boundary.
- **Response Interceptor:**
  - Intercepts HTTP `401 Unauthorized` responses on authenticated endpoints.
  - Queues concurrent calls and executes a single atomic call to `/api/auth/refresh`.
  - Upon successful token rotation, automatically retries the original request once.

---

## 5. Data Models & Schemas

### 5.1. User Model (`Backend/src/models/User.js`)
- `name`: String, required, trimmed.
- `email`: String, required, unique, lowercase, trimmed.
- `passwordHash`: String, bcrypt hash.
- `refreshTokenHash`: String, SHA-256 hash of active refresh token (single active session per user).
- `passwordResetOtpHash`: String, SHA-256 hash of active 6-digit recovery code.
- `passwordResetOtpExpiresAt`: Date (10 minutes validity).
- `passwordResetAttempts`: Number (max 5 incorrect attempts).
- `passwordResetLastSentAt`: Date (60-second cooldown enforcement).

### 5.2. Topic Model (`Backend/src/models/Topic.js`)
- `title`: String, required, unique index.
- `slug`: String, required, lowercase, unique index.
- `category`: String, enum: `Philosophy`, `Science`, `Psychology`, `History`, `Technology`, `Art`, `Economics`, `Culture`, `Nature`, `Curious`.
- `description`: String, required.
- `source`: String, enum: `seed`, `gemini_auto`, `user`.
- `isActive`: Boolean, default `true`.
- Compound Indexes: `{ category: 1, isActive: 1 }`, `{ slug: 1, isActive: 1 }`.

### 5.3. TopicImpression Model (`Backend/src/models/TopicImpression.js`)
- `user`: ObjectId referencing User (optional).
- `clientToken`: String anonymous identifier (optional).
- `topic`: ObjectId referencing Topic, required.
- `category`: String, required.
- `createdAt`: Date with 7-day TTL index (`expireAfterSeconds: 604800`) to automatically purge historical impression records.

### 5.4. LearningSession Model (`Backend/src/models/LearningSession.js`)
- `user`: ObjectId referencing User, required.
- `topic`: ObjectId referencing Topic, required.
- `status`: String, enum: `in_progress`, `completed`.
- `startedAt`: Date, default `Date.now`.
- `completedAt`: Date.
- `durationSeconds`: Number.
- `reflection`:
  - `whatILearned`: String (max 5000 chars).
  - `whatSurprisedMe`: String (max 5000 chars).
  - `myOpinion`: String (max 5000 chars).
  - `questionsRemaining`: String (max 5000 chars).

### 5.5. SpeechSession Model (`Backend/src/models/SpeechSession.js`)
- `user`: ObjectId referencing User, required.
- `topic`: ObjectId referencing Topic, required.
- `durationMinutes`: Number, enum: `[5, 10, 15]`.
- `actualDurationSeconds`: Number, default `0`.
- `status`: String, enum: `in_progress`, `processing`, `completed`, `failed`.
- `transcript`: String.
- `analysis`:
  - `overallScore`: Number (0-100).
  - `executiveSummary`: String.
  - `epistemicMetrics`: `{ argumentProgression, empiricalEvidence, conceptualClarity, rhetoricalPacing }`.
  - `strengths`: Array of Strings.
  - `areasForImprovement`: Array of Strings.
  - `strongerAnswer`: `{ structure, exampleRewrite }`.
- `audioMetadata`: `{ mimeType, sizeBytes, originalName, tempFilePath, storedUntil }`.
- `failureReason`: String (sanitized from upstream errors).

### 5.6. ResearchSource Model (`Backend/src/models/ResearchSource.js`)
- `topic`: ObjectId referencing Topic, required.
- `title`: String, required.
- `authors`: Array of Strings.
- `publicationYear`: Number.
- `sourceType`: String, enum: `journal_article`, `academic_book`, `primary_source`, `essay`, `case_law`.
- `url`: String.
- `summary`: String.
- `reviewed`: Boolean, default `true`.