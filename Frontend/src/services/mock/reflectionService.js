/**
 * Mock Reflection Storage Service
 * 
 * Manages scholar reflection entries in local browser storage.
 * Designed to be swapped with a permanent cloud-backed database endpoint
 * without modifying the Reflection UI component.
 */

const REFLECTION_PREFIX = 'braindetour_reflection_'

export const mockReflectionService = {
  /**
   * Retrieves an existing reflection entry by topicId.
   * @param {string} topicId
   * @returns {Promise<{ learned: string, surprised: string, opinion: string, questions: string, updatedAt: string } | null>}
   */
  async getReflection(topicId) {
    if (!topicId) return null
    try {
      const stored = localStorage.getItem(`${REFLECTION_PREFIX}${topicId}`)
      if (!stored) return null
      return JSON.parse(stored)
    } catch {
      return null
    }
  },

  /**
   * Saves or updates a reflection entry.
   * @param {string} topicId
   * @param {{ learned: string, surprised: string, opinion: string, questions: string }} data
   * @returns {Promise<{ learned: string, surprised: string, opinion: string, questions: string, updatedAt: string }>}
   */
  async saveReflection(topicId, data) {
    if (!topicId) throw new Error('Topic identifier is required to save a reflection.')

    const record = {
      learned: data.learned || '',
      surprised: data.surprised || '',
      opinion: data.opinion || '',
      questions: data.questions || '',
      updatedAt: new Date().toISOString(),
    }

    try {
      localStorage.setItem(`${REFLECTION_PREFIX}${topicId}`, JSON.stringify(record))
      return record
    } catch {
      throw new Error('Local browser storage quota exceeded. Unable to save reflection.')
    }
  },

  /**
   * Clears a reflection entry for the topic.
   * @param {string} topicId
   */
  async deleteReflection(topicId) {
    if (!topicId) return
    localStorage.removeItem(`${REFLECTION_PREFIX}${topicId}`)
  },
}
