import { usePageTitle } from '../hooks/usePageTitle'
import './Pages.css'

export function FaqPage() {
  usePageTitle('Frequently Asked Questions — BrainDetour')

  const faqItems = [
    {
      question: 'How does the Random Topic Wheel select subjects?',
      answer:
        'The Curiosity Wheel queries BrainDetour’s curated library of active topics across 10 academic and cultural disciplines, including Science, Psychology, Technology, Philosophy, Art, and History. You can filter by a specific discipline or leave it on "All" for serendipitous discovery. When spun, the wheel animates a vertical reel deceleration and locks onto an authentic topic from the database.',
    },
    {
      question: 'What is the BrainDetour 4-stage learning cycle?',
      answer:
        'BrainDetour transforms passive browsing into active scholarship through four deliberate steps: (1) Serendipitous Discovery via the Curiosity Wheel, (2) Empirical Research with verified scholarly sources, (3) Oral Synthesis in the Speech Lab against a structured timer, and (4) Personal Reflection across four structured pillars.',
    },
    {
      question: 'How are my learning reflections persisted and protected?',
      answer:
        'When you submit a reflection, all four pillars—What I Learned, What Surprised Me, My Opinion, and Questions Remaining—are permanently saved to your authenticated MongoDB learning session. While you type, a debounced draft is saved locally in your browser to prevent accidental data loss. Drafts are strictly scoped to your user ID and topic so multiple accounts never cross-contaminate unfinished work.',
    },
    {
      question: 'How does the Speech Lab work?',
      answer:
        'Speech Lab challenges you to present your thesis aloud without notes. Choose between 5, 10, or 15-minute durations. When you start, your AI Speech Coach greets you aloud with your first name and introduces the session. Once the introduction finishes, the high-precision wall-clock countdown begins and your microphone records in 1-second audio slices.',
    },
    {
      question: 'How does Gemini AI evaluate speech presentations?',
      answer:
        'Upon completing a speech, your audio is securely sent to Google Gemini for transcription and deep epistemic evaluation. The AI evaluates argument progression, empirical claims, structural coherence, and identifies overlooked perspectives, offering a constructive score and a stronger rewrite of your thesis.',
    },
    {
      question: 'What happens to my audio recording after analysis?',
      answer:
        'Audio recordings are temporarily held on the server solely to facilitate asynchronous transcription and evaluation. Once Gemini finishes analysis, the audio file is automatically cleaned up and permanently removed from server disk storage. Your transcript, coaching metrics, and feedback report remain safely stored in your private history.',
    },
    {
      question: 'How is account authentication and session security managed?',
      answer:
        'BrainDetour employs modern HttpOnly, SameSite, and Secure cookie architecture with automatic token rotation. Access tokens are valid for 7 minutes, while refresh tokens remain active for 15 days. Refresh tokens are single-use; any detected token reuse immediately revokes the session to safeguard your account against token theft.',
    },
  ]

  return (
    <div className="info-page">
      <header className="page-header page-header--centered">
        <span className="page-header__badge">Knowledge Base</span>
        <h1 className="page-header__title">Frequently Asked Questions</h1>
        <p className="page-header__description">
          Everything you need to know about BrainDetour topic discovery, empirical research, Speech Lab oral synthesis, and account security.
        </p>
      </header>

      <div className="faq-list" role="region" aria-label="FAQ Questions and Answers">
        {faqItems.map((item, index) => (
          <article key={index} className="faq-item">
            <h2 className="faq-item__question">
              <span className="faq-item__question-icon" aria-hidden="true">✦</span>
              <span>{item.question}</span>
            </h2>
            <p className="faq-item__answer">{item.answer}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

