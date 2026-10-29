import { usePageTitle } from '../hooks/usePageTitle'
import './Pages.css'

export function ContactPage() {
  usePageTitle('Contact Support & Inquiries — BrainDetour')

  return (
    <div className="info-page">
      <header className="page-header page-header--centered">
        <span className="page-header__badge">Get in Touch</span>
        <h1 className="page-header__title">Contact &amp; Inquiries</h1>
        <p className="page-header__description">
          Have a question, discovered an anomaly, or want to suggest an intriguing topic? Reach out directly to the BrainDetour development team.
        </p>
      </header>

      <section className="info-content-card">
        <h2>Direct Email Channel</h2>
        <p>
          We prioritize thoughtful communication and inspect incoming inquiries regularly. Our official team inbox is:
        </p>
        <p>
          <a
            href="mailto:braindetour2026@gmail.com"
            className="contact-card__email-link"
            title="Open default email application"
          >
            ✉️ braindetour2026@gmail.com
          </a>
        </p>
        <p style={{ marginTop: 'var(--space-3)' }}>
          We aim to review and respond to inquiries within <strong>24 to 48 business hours</strong>.
        </p>
      </section>

      <div className="contact-grid">
        <article className="contact-card">
          <div className="contact-card__icon" aria-hidden="true">🐞</div>
          <h3 className="contact-card__title">Bug Reports &amp; Technical Issues</h3>
          <p className="contact-card__text">
            Encountered an issue with microphone recording, timer synchronization, or topic roulette? Please include your operating system, browser version, and a brief description of the steps that led to the issue.
          </p>
          <a
            href="mailto:braindetour2026@gmail.com?subject=Bug%20Report%3A%20BrainDetour"
            className="contact-card__email-link"
          >
            Report Bug →
          </a>
        </article>

        <article className="contact-card">
          <div className="contact-card__icon" aria-hidden="true">🔒</div>
          <h3 className="contact-card__title">Account &amp; Privacy Requests</h3>
          <p className="contact-card__text">
            Need help with your login credentials, password resets, reflection history export, or account deletion? Reach out with the email address linked to your account.
          </p>
          <a
            href="mailto:braindetour2026@gmail.com?subject=Account%20%2F%20Privacy%20Request"
            className="contact-card__email-link"
          >
            Account Help →
          </a>
        </article>

        <article className="contact-card">
          <div className="contact-card__icon" aria-hidden="true">💡</div>
          <h3 className="contact-card__title">Topic &amp; Feature Suggestions</h3>
          <p className="contact-card__text">
            Know an intellectually stimulating subject that belongs in our 10 curiosity categories? Or have an idea to make Speech Lab coaching more rigorous? Send us your suggestions!
          </p>
          <a
            href="mailto:braindetour2026@gmail.com?subject=Topic%20%2F%20Feature%20Suggestion"
            className="contact-card__email-link"
          >
            Share Ideas →
          </a>
        </article>
      </div>
    </div>
  )
}

