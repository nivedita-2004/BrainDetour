/**
 * Learning Session & Reflection API Service
 * 
 * Interacts directly with BrainDetour backend learning endpoints:
 * - GET   /api/learning/sessions/by-topic/:topicId
 * - POST  /api/learning/sessions
 * - PATCH /api/learning/sessions/:id/reflection
 * - PATCH /api/learning/sessions/:id/complete
 * - GET   /api/learning/history
 */

const API_BASE = '/api/learning';

/**
 * Retrieves the user's most recent learning session for a given topic.
 * @param {string} topicId - Topic ObjectId or slug
 * @returns {Promise<Object|null>}
 */
export async function fetchTopicLearningSession(topicId) {
  if (!topicId) return null;
  try {
    const res = await fetch(`${API_BASE}/sessions/by-topic/${encodeURIComponent(topicId)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 404) return null;
      throw new Error(`Failed to load learning session (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.session || null;
  } catch (err) {
    console.warn('Could not fetch topic learning session:', err);
    return null;
  }
}

/**
 * Starts a new learning session or resumes an existing in-progress session.
 * @param {string} topicId
 * @returns {Promise<Object>}
 */
export async function startOrResumeLearningSession(topicId) {
  if (!topicId) throw new Error('topicId is required to start a learning session');

  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ topicId }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    if (res.status === 401) {
      throw new Error('Authentication required. Please log in to record your reflections.');
    }
    throw new Error(data.message || 'Failed to start learning session');
  }

  return data.session;
}

/**
 * Saves one or more reflection fields permanently to the learning session in MongoDB.
 * @param {string} sessionId
 * @param {Object} reflectionFields - { whatILearned, whatSurprisedMe, myOpinion, questionsRemaining }
 * @returns {Promise<Object>}
 */
export async function saveSessionReflection(sessionId, reflectionFields) {
  if (!sessionId) throw new Error('sessionId is required to update reflection');

  const res = await fetch(`${API_BASE}/sessions/${sessionId}/reflection`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(reflectionFields),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    if (res.status === 401) {
      throw new Error('Authentication required. Please log in to save your reflection.');
    }
    throw new Error(data.message || 'Failed to save reflection to your learning session');
  }

  return data.session;
}

/**
 * Completes a learning session.
 * @param {string} sessionId
 * @param {number} [durationSeconds]
 * @returns {Promise<Object>}
 */
export async function completeLearningSession(sessionId, durationSeconds = 0) {
  if (!sessionId) throw new Error('sessionId is required to complete session');

  const res = await fetch(`${API_BASE}/sessions/${sessionId}/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ durationSeconds }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to complete learning session');
  }

  return data.session;
}

