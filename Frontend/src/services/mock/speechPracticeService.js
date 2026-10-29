/**
 * Speech Practice Mock Service Interface
 * 
 * IMPORTANT ARCHITECTURAL NOTE:
 * This service encapsulates all Speech Lab topic selection, practice configuration,
 * and diagnostic evaluation logic.
 * 
 * In this milestone, it provides realistic simulated analysis data clearly flagged as mock.
 * In future backend integration milestones, this interface will point directly to:
 * - GET /api/speech/topics/random
 * - POST /api/speech/analyze
 * without requiring any architectural changes to Speech Lab UI components.
 */

import { MOCK_TOPICS } from '../../data/mock/topics'

export const speechPracticeService = {
  /**
   * Retrieves a random topic from the canonical topic dataset.
   * Optionally avoids the current topicId so the user gets a new detour.
   * @param {string} [excludeId]
   * @returns {Promise<import('../../data/mock/topics').Topic>}
   */
  async getRandomPracticeTopic(excludeId = null) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const pool = MOCK_TOPICS.filter((t) => t.id !== excludeId)
    if (pool.length === 0) return MOCK_TOPICS[0]
    const randomIndex = Math.floor(Math.random() * pool.length)
    return pool[randomIndex]
  },

  /**
   * Retrieves a practice topic by its unique identifier.
   * @param {string} topicId
   * @returns {Promise<import('../../data/mock/topics').Topic | null>}
   */
  async getPracticeTopicById(topicId) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const topic = MOCK_TOPICS.find((t) => t.id === topicId)
    return topic || MOCK_TOPICS[0]
  },

  /**
   * Returns supported rehearsal target durations (in minutes).
   * @returns {Array<{ value: number, label: string }>}
   */
  getAvailableDurations() {
    return [
      { value: 5, label: '5 Minutes' },
      { value: 10, label: '10 Minutes' },
      { value: 15, label: '15 Minutes' },
    ]
  },

  /**
   * Evaluates a presentation transcript against epistemic reasoning rubrics.
   * Generates structured diagnostic feedback across the 6 required dimensions.
   * 
   * @param {{
   *   topic: { id: string, title: string, category: string, evidencePrompt?: string },
   *   transcript: string,
   *   durationMinutes: number
   * }} params
   * @returns {Promise<{
   *   isMock: boolean,
   *   mockNotice: string,
   *   overallScore: number,
   *   overallSummary: string,
   *   dimensions: Array<{
   *     id: string,
   *     name: string,
   *     score: string,
   *     status: string,
   *     statusType: 'supported' | 'mixed' | 'insufficient',
   *     summary: string,
   *     details?: string[]
   *   }>
   * }>}
   */
  async analyzeSpeech({ topic, transcript, durationMinutes = 5 }) {
    // Simulate brief processing latency
    await new Promise((resolve) => setTimeout(resolve, 800))

    const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
    const title = topic?.title || 'Selected Topic'

    // Compute realistic score variance based on transcript depth
    let baseScore = 85
    if (wordCount < 40) baseScore = 68
    else if (wordCount < 100) baseScore = 78
    else if (wordCount > 350) baseScore = 91

    return {
      isMock: true,
      mockNotice:
        '✦ Simulated AI Diagnostic Review — Backend integration scheduled for future milestone. Analysis evaluates transcript coherence, reasoning structure, and evidence claims; acoustic vocal tone and pronunciation are not evaluated.',
      overallScore: baseScore,
      overallSummary: `Speech presentation demonstrates clear engagement with "${title}". The thesis is stated early, progressing into substantive exploration before addressing audience considerations.`,
      dimensions: [
        {
          id: 'clarity',
          name: '1. Clarity of Explanation',
          score: `${Math.min(96, baseScore + 4)} / 100`,
          status: 'High Clarity',
          statusType: 'supported',
          summary: 'Accessible, articulate vocabulary. Technical concepts and disciplinary terms are unpacked concisely without convoluted sentence syntax.',
          details: [
            'Opening sentence hooks attention without unnecessary filler phrases.',
            'Transitions between claims remain smooth and conversational.',
          ],
        },
        {
          id: 'organization',
          name: '2. Organization & Logical Flow',
          score: `${Math.min(94, baseScore + 2)} / 100`,
          status: 'Strong Progression',
          statusType: 'supported',
          summary: 'Structured narrative progression: introductory thesis, two core supporting premises, and a synthesis concluding with an open inquiry question.',
          details: [
            'Follows the target rehearsal pace calibrated for a ' + durationMinutes + '-minute presentation.',
            'Each paragraph or spoken chunk advances a distinct argument.',
          ],
        },
        {
          id: 'relevance',
          name: '3. Relevance to Topic',
          score: `${Math.min(98, baseScore + 6)} / 100`,
          status: 'Optimal Focus',
          statusType: 'supported',
          summary: `Tightly aligned to the central prompt: "${topic?.evidencePrompt || title}". Does not drift into speculative tangents.`,
          details: [
            'Directly responds to key questions identified during preliminary research.',
          ],
        },
        {
          id: 'reasoning',
          name: '4. Strength of Reasoning',
          score: `${Math.max(70, baseScore - 3)} / 100`,
          status: 'Sound Argumentation',
          statusType: 'supported',
          summary: 'Constructs a valid inductive argument. Connects observations to general principles with clear causal justification.',
          details: [
            'Acknowledges potential counter-arguments or rival interpretations.',
          ],
        },
        {
          id: 'evidence',
          name: '5. Claims Requiring Evidence',
          score: `${Math.max(65, baseScore - 7)} / 100`,
          status: 'Partially Supported',
          statusType: 'mixed',
          summary: 'Foundational claims align with peer consensus. However, broader claims regarding long-term societal or empirical outcomes would benefit from citing specific study data.',
          details: [
            'Primary assertion is backed by source literature.',
            'Recommend citing author or publication year when stating empirical frequency.',
          ],
        },
        {
          id: 'improvements',
          name: '6. Specific Improvements & Next Steps',
          score: 'Actionable',
          status: 'Focus Areas',
          statusType: 'insufficient',
          summary: 'Consider opening with a 15-second rhetorical thought experiment to frame the stakes before presenting technical findings.',
          details: [
            'Vary sentence cadence to emphasize key thesis takeaways.',
            'Conclude with a clear call-to-curiosity or follow-up research direction.',
          ],
        },
      ],
    }
  },
}
