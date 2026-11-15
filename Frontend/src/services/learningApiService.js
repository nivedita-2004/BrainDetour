/**
 * Learning Session & Reflection API Service
 * 
 * Interacts directly with BrainDetour backend learning endpoints via centralized Axios client:
 * - GET   /api/learning/sessions/by-topic/:topicId
 * - POST  /api/learning/sessions
 * - PATCH /api/learning/sessions/:id/reflection
 * - PATCH /api/learning/sessions/:id/complete
 * - GET   /api/learning/history
 */

import { api } from './api';

const LEARNING_BASE = '/api/learning';

/**
 * Retrieves the user's most recent learning session for a given topic.
 * @param {string} topicId - Topic ObjectId or slug
 * @returns {Promise<Object|null>}
 */
export async function fetchTopicLearningSession(topicId) {
  if (!topicId) return null;
  try {
    const res = await api.get(`${LEARNING_BASE}/sessions/by-topic/${encodeURIComponent(topicId)}`);
    return res.data?.session || null;
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 404) return null;
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

  try {
    const res = await api.post(`${LEARNING_BASE}/sessions`, { topicId });
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to start learning session');
    }
    return data.session;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication required. Please log in to record your reflections.');
    }
    const message = err.response?.data?.message || err.message || 'Failed to start learning session';
    throw new Error(message);
  }
}

/**
 * Saves one or more reflection fields permanently to the learning session in MongoDB.
 * @param {string} sessionId
 * @param {Object} reflectionFields - { whatILearned, whatSurprisedMe, myOpinion, questionsRemaining }
 * @returns {Promise<Object>}
 */
export async function saveSessionReflection(sessionId, reflectionFields) {
  if (!sessionId) throw new Error('sessionId is required to update reflection');

  try {
    const res = await api.patch(`${LEARNING_BASE}/sessions/${sessionId}/reflection`, reflectionFields);
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to save reflection to your learning session');
    }
    return data.session;
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication required. Please log in to save your reflection.');
    }
    const message = err.response?.data?.message || err.message || 'Failed to save reflection to your learning session';
    throw new Error(message);
  }
}

/**
 * Completes a learning session.
 * @param {string} sessionId
 * @param {number} [durationSeconds]
 * @returns {Promise<Object>}
 */
export async function completeLearningSession(sessionId, durationSeconds = 0) {
  if (!sessionId) throw new Error('sessionId is required to complete session');

  try {
    const res = await api.patch(`${LEARNING_BASE}/sessions/${sessionId}/complete`, { durationSeconds });
    const data = res.data || {};
    if (!data.success) {
      throw new Error(data.message || 'Failed to complete learning session');
    }
    return data.session;
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Failed to complete learning session';
    throw new Error(message);
  }
}
