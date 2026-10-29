import { usePageTitle } from '../hooks/usePageTitle'
import './Pages.css'

export function TermsPage() {
  usePageTitle('Terms of Service — BrainDetour')

  return (
    <div className="info-page">
      <header className="page-header page-header--centered">
        <span className="page-header__badge">Guidelines &amp; Policies</span>
        <h1 className="page-header__title">Terms of Service</h1>
        <p className="page-header__description">
          Welcome to BrainDetour. By exploring our curiosity topics, practicing oral rhetoric, or saving reflections, you agree to the following educational usage terms.
        </p>
      </header>

      <div className="info-content-card">
        <h2>1. Purpose &amp; Scope of Service</h2>
        <p>
          BrainDetour is an independent digital learning environment built to foster serendipitous intellectual curiosity, rigorous evidence gathering, and structured oral synthesis. All tools—including the topic wheel, source compendiums, and Speech Lab—are designed for personal study and communication improvement.
        </p>

        <h2>2. Acceptable Use Policy</h2>
        <p>
          As a member of the BrainDetour community, you agree to:
        </p>
        <ul>
          <li>Use the platform exclusively for lawful personal, academic, or self-directed learning objectives.</li>
          <li>Refrain from attempting automated penetration, credential stuffing, rate-limit circumvention, or denial-of-service activities.</li>
          <li>Never upload malicious payloads, executable files, or audio containing abusive, threatening, or illegal speech.</li>
          <li>Respect intellectual property when consulting referenced scholarly sources.</li>
        </ul>

        <h2>3. Educational Nature of AI-Generated Coaching</h2>
        <p>
          Speech Lab assessments, transcriptions, scores, and rewrites are generated using automated artificial intelligence (Google Gemini). While designed around principles of empirical rigor, rhetoric, and debate:
        </p>
        <ul>
          <li>AI feedback does not constitute certified academic grading, formal speech pathology counsel, legal advice, or professional editorial review.</li>
          <li>Evaluations are heuristic suggestions meant to provoke self-reflection and argument clarity rather than absolute verdicts of factual truth.</li>
        </ul>

        <h2>4. Account Security &amp; Credentials</h2>
        <p>
          You are responsible for maintaining the confidentiality of your login credentials. You agree to notify us immediately at <code>braindetour2026@gmail.com</code> if you detect unauthorized access to your account. We reserve the right to suspend accounts engaged in abusive behavior or token tampering.
        </p>

        <h2>5. Service Availability &amp; Modifications</h2>
        <p>
          We strive for continuous, reliable operation; however, BrainDetour is provided on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis. Periodic maintenance, feature upgrades, or third-party AI provider fluctuations may occasionally affect response speeds or service availability.
        </p>

        <h2>6. Contact Regarding Terms</h2>
        <p>
          If you have questions regarding these Terms of Service or platform guidelines, please reach out to:
        </p>
        <p>
          <a
            href="mailto:braindetour2026@gmail.com?subject=Terms%20of%20Service%20Inquiry"
            className="contact-card__email-link"
          >
            ✉️ braindetour2026@gmail.com
          </a>
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-6)' }}>
          Effective: October 2026 &bull; BrainDetour Platform
        </p>
      </div>
    </div>
  )
}

