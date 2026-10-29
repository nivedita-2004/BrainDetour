/**
 * Speech Lab API Client
 * 
 * Interacts directly with BrainDetour backend speech endpoints:
 * - POST /api/speech/sessions
 * - POST /api/speech/sessions/:id/complete (multipart audio upload)
 * - GET  /api/speech/sessions/:id
 * - GET  /api/speech/history
 * - POST /api/speech/sessions/:id/retry-analysis
 * - GET  /api/topics/random
 */

import { fetchWithAuth } from '../context/AuthProvider';

const API_BASE = '/api';

/**
 * Checks whether an authenticated session exists for the user.
 * Never automatically signs up or logs in dummy accounts.
 */
export async function ensureScholarAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Fetch a random active topic from the backend Topic API, optionally filtered by category.
 * 
 * @param {string} [category] - Optional category filter (e.g. 'Science', 'Technology', or null/'All')
 */
export async function fetchRandomSpeechTopic(category = null) {
  const url =
    category && category !== 'All'
      ? `${API_BASE}/topics/random?category=${encodeURIComponent(category)}`
      : `${API_BASE}/topics/random`;
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok || !data.success || !data.topic) {
    throw new Error(data.message || `Could not fetch a random topic (HTTP ${res.status})`);
  }
  return data.topic;
}

/**
 * Fetch all active topics from backend, optionally filtered by category.
 * 
 * @param {string} [category]
 */
export async function fetchActiveTopics(category = null) {
  try {
    const url =
      category && category !== 'All'
        ? `${API_BASE}/topics?category=${encodeURIComponent(category)}`
        : `${API_BASE}/topics`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return data.topics || [];
  } catch (err) {
    console.warn('Could not fetch topics:', err);
    return [];
  }
}

/**
 * Create a new speech session with selected topic and practice duration.
 * 
 * @param {Object} params
 * @param {string} params.topicId
 * @param {number} params.durationMinutes - 5, 10, or 15
 */
export async function createSpeechSession({ topicId, durationMinutes }) {
  if (!topicId || typeof topicId !== 'string' || !topicId.trim()) {
    throw new Error('Invalid topicId: A valid topic identifier is required.');
  }

  const res = await fetchWithAuth(`${API_BASE}/speech/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicId: topicId.trim(), durationMinutes }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    if (res.status === 401) {
      throw new Error('Authentication required. Please log in to start a speech session.');
    }
    throw new Error(data.message || 'Failed to initialize speech session');
  }
  return data.session;
}

/**
 * Uploads audio recording (or text transcript) to complete capture and initiate Gemini processing.
 * 
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {Blob} [params.audioBlob]
 * @param {string} [params.transcript]
 * @param {number} [params.actualDurationSeconds]
 */
export async function completeSpeechSession({ sessionId, audioBlob, transcript, actualDurationSeconds = 0 }) {
  let res;

  if (audioBlob) {
    const formData = new FormData();
    const mimeType = audioBlob.type || 'audio/webm';
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    formData.append('audio', audioBlob, `speech-rehearsal.${ext}`);
    formData.append('actualDurationSeconds', String(actualDurationSeconds));
    if (transcript) {
      formData.append('transcript', transcript);
    }

    res = await fetchWithAuth(`${API_BASE}/speech/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: formData,
    });
  } else {
    res = await fetchWithAuth(`${API_BASE}/speech/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: transcript || '',
        actualDurationSeconds,
      }),
    });
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    if (res.status === 401) {
      throw new Error('Authentication required. Please log in.');
    }
    throw new Error(data.message || 'Failed to complete speech recording');
  }
  return data.session;
}

/**
 * Retrieves speech session status and analysis result.
 * 
 * @param {string} sessionId
 */
export async function getSpeechSession(sessionId) {
  const res = await fetchWithAuth(`${API_BASE}/speech/sessions/${sessionId}`);

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to retrieve speech session');
  }
  return data.session;
}

/**
 * Polls the session until analysis status is 'completed' or 'failed'.
 * 
 * @param {string} sessionId
 * @param {Function} [onProgress]
 * @param {number} [intervalMs=2500]
 * @param {number} [maxAttempts=60]
 */
export async function pollSpeechSessionUntilComplete(sessionId, onProgress, intervalMs = 2500, maxAttempts = 60) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const session = await getSpeechSession(sessionId);

    if (onProgress) {
      onProgress(session);
    }

    if (session.status === 'completed' || session.status === 'failed') {
      return session;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Analysis request timed out. Please refresh or retry from history.');
}

/**
 * Retrieves paginated speech session history for the current authenticated scholar.
 * 
 * @param {number} [page=1]
 * @param {number} [limit=10]
 */
export async function getSpeechHistory(page = 1, limit = 10) {
  const res = await fetchWithAuth(`${API_BASE}/speech/history?page=${page}&limit=${limit}`);

  const data = await res.json();
  if (!res.ok || !data.success) {
    if (res.status === 401) {
      throw new Error('Authentication required. Please log in.');
    }
    throw new Error(data.message || 'Failed to retrieve speech history');
  }
  return data;
}

/**
 * Retries a failed analysis for a session.
 * 
 * @param {string} sessionId
 */
export async function retrySpeechAnalysis(sessionId) {
  const res = await fetchWithAuth(`${API_BASE}/speech/sessions/${sessionId}/retry-analysis`, {
    method: 'POST',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    if (res.status === 401) {
      throw new Error('Authentication required. Please log in.');
    }
    throw new Error(data.message || 'Failed to retry speech analysis');
  }
  return data.session;
}
