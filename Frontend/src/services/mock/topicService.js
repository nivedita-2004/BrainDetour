/**
 * Mock Topic Service
 *
 * NOTE: This is an in-memory mock service layer designed to simulate asynchronous
 * data retrieval for curiosity topics. In production, these methods will be swapped
 * with real REST or GraphQL API clients without altering UI component signatures.
 */

import { MOCK_TOPICS } from '../../data/mock/topics'

/**
 * Simulates fetching all curiosity topics with an optional artificial latency.
 * @returns {Promise<Array>}
 */
export async function getMockTopics() {
  // Simulates short network resolution for realistic UI loading states
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([...MOCK_TOPICS])
    }, 100)
  })
}

/**
 * Simulates fetching a single topic by its unique slug identifier.
 * @param {string} topicId
 * @returns {Promise<Object|null>}
 */
export async function getMockTopicById(topicId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const topic = MOCK_TOPICS.find((t) => t.id === topicId) || null
      resolve(topic)
    }, 80)
  })
}

/**
 * Simulates filtering topics by category.
 * @param {string} category
 * @returns {Promise<Array>}
 */
export async function getMockTopicsByCategory(category) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!category || category === 'All') {
        resolve([...MOCK_TOPICS])
      } else {
        const filtered = MOCK_TOPICS.filter((t) => t.category === category)
        resolve(filtered)
      }
    }, 80)
  })
}
