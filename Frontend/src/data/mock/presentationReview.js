/**
 * Mock Presentation Review Data
 * Clearly identified sample data for presentation review rubrics and AI evidence feedback.
 * Note: This file will be replaced by a live AI review service in future milestones.
 */

export const MOCK_PRESENTATION_RUBRICS = [
  {
    id: 'rubric-clarity',
    title: 'Clarity of Hypothesis & Central Thesis',
    weight: '25%',
    description: 'Evaluates whether the presentation states a coherent thesis within the opening minutes with accessible framing.',
  },
  {
    id: 'rubric-evidence',
    title: 'Evidence Strength & Citation Quality',
    weight: '35%',
    description: 'Measures empirical backing, quality of sources, handling of counter-evidence, and epistemic rigour.',
  },
  {
    id: 'rubric-delivery',
    title: 'Pacing, Structure & Vocal Delivery',
    weight: '20%',
    description: 'Assesses speech cadence, transition smooth-flow, slide economy, and audience engagement retention.',
  },
  {
    id: 'rubric-curiosity',
    title: 'Curiosity Engagement & Question Generation',
    weight: '20%',
    description: 'Tracks whether the presentation inspires proactive inquiry and thoughtful audience discussions.',
  },
]

export const MOCK_SAMPLE_REVIEW = {
  id: 'rev-sample-001',
  presentationTitle: 'The Limits of Empirical Evidence in Cognitive Neural Mapping',
  speaker: 'Candidate Demo',
  durationMinutes: 5.2,
  overallScore: 88,
  curiosityScore: 92,
  summaryFeedback: 'Compelling presentation with rigorous source evaluation. Delivery was well-paced, and the speaker handled opposing theories with commendable intellectual humility.',
  strengths: [
    'Strong citation transparency with peer-reviewed literature references.',
    'Clear delineation between observed brain activity and inferred psychological states.',
    'Engaging hook that immediately piqued curiosity.',
  ],
  growthAreas: [
    'Slide 4 contained dense tabular data that could be simplified for 5-minute delivery.',
    'Address potential alternative explanations before moving to conclusions.',
  ],
}
