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

import { api } from './api';

const API_BASE = '/api';

/**
 * Checks whether an authenticated session exists for the user.
 * Never automatically signs up or logs in dummy accounts.
 */
export async function ensureScholarAuth() {
  try {
    const res = await api.get('/auth/me');
    return res.status >= 200 && res.status < 300;
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
  try {
    const params = category && category !== 'All' ? { category } : {};
    const res = await api.get('/topics/random', { params });
    const data = res.data || {};
    if (!data.success || !data.topic) {
      throw new Error(data.message || `Could not fetch a random topic (HTTP ${res.status})`);
    }
    return data.topic;
  } catch (err) {
    const status = err.response?.status;
    const msg =
      err.response?.data?.message ||
      err.message ||
      (status ? `Could not fetch a random topic (HTTP ${status})` : 'Could not fetch a random topic');
    throw new Error(msg);
  }
}

/**
 * Fetch all active topics from backend, optionally filtered by category.
 * 
 * @param {string} [category]
 */
export async function fetchActiveTopics(category = null) {
  try {
    const params = category && category !== 'All' ? { category } : {};
    const res = await api.get('/topics', { params });
    return res.data?.topics || [];
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

  try {
    const res = await api.post('/speech/sessions', {
      topicId: topicId.trim(),
      durationMinutes,
    });
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to initialize speech session');
    }
    return data.session;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication required. Please log in to start a speech session.');
    }
    const message = err.response?.data?.message || err.message || 'Failed to initialize speech session';
    throw new Error(message);
  }
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
  try {
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
      res = await api.post(`/speech/sessions/${sessionId}/complete`, formData);
    } else {
      res = await api.post(`/speech/sessions/${sessionId}/complete`, {
        transcript: transcript || '',
        actualDurationSeconds,
      });
    }

    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to complete speech recording');
    }
    return data.session;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication required. Please log in.');
    }
    const message = err.response?.data?.message || err.message || 'Failed to complete speech recording';
    throw new Error(message);
  }
}

/**
 * Retrieves speech session status and analysis result.
 * 
 * @param {string} sessionId
 */
export async function getSpeechSession(sessionId) {
  try {
    const res = await api.get(`/speech/sessions/${sessionId}`);
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to retrieve speech session');
    }
    return data.session;
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Failed to retrieve speech session';
    throw new Error(message);
  }
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
  try {
    const res = await api.get('/speech/history', {
      params: { page, limit },
    });
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to retrieve speech history');
    }
    return data;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication required. Please log in.');
    }
    const message = err.response?.data?.message || err.message || 'Failed to retrieve speech history';
    throw new Error(message);
  }
}

/**
 * Retries a failed analysis for a session.
 * 
 * @param {string} sessionId
 */
export async function retrySpeechAnalysis(sessionId) {
  try {
    const res = await api.post(`/speech/sessions/${sessionId}/retry-analysis`);
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to retry speech analysis');
    }
    return data.session;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication required. Please log in.');
    }
    const message = err.response?.data?.message || err.message || 'Failed to retry speech analysis';
    throw new Error(message);
  }
}
