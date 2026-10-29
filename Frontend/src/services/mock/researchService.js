/**
 * Mock Research Service Interface
 * 
 * Provides academic sources and empirical citations associated with an inquiry topic.
 * Designed to be replaced with a live academic search API (Semantic Scholar, CrossRef, etc.)
 * in future milestones without changing the presentation components.
 */

import { MOCK_RESEARCH_SOURCES } from '../../data/mock/researchSources'

export const mockResearchService = {
  /**
   * Retrieves 2 to 5 curated research results for a given topicId.
   * @param {string} topicId
   * @returns {Promise<Array<{ id: string, topicId: string, title: string, publisher: string, excerpt: string, url: string, publishedYear: string }>>}
   */
  async getResearchByTopicId(topicId) {
    // Simulate brief network latency
    await new Promise((resolve) => setTimeout(resolve, 200))

    if (!topicId) return []

    const sources = MOCK_RESEARCH_SOURCES.filter((s) => s.topicId === topicId)

    // Enforce requirements: minimum 2, maximum 5 sources
    if (sources.length >= 2) {
      return sources.slice(0, 5)
    }

    // Graceful fallback if topic has fewer than 2 specific sources
    const generalSources = MOCK_RESEARCH_SOURCES.slice(0, 3).map((s, idx) => ({
      ...s,
      id: `fallback-${topicId}-${idx}`,
      topicId,
    }))

    return generalSources
  },
}
