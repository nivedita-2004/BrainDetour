import { usePageTitle } from '../hooks/usePageTitle'
import './Pages.css'

export function PrivacyPage() {
  usePageTitle('Privacy Policy — BrainDetour')

  return (
    <div className="info-page">
      <header className="page-header page-header--centered">
        <span className="page-header__badge">Data &amp; Integrity</span>
        <h1 className="page-header__title">Privacy Policy</h1>
        <p className="page-header__description">
          BrainDetour is dedicated to self-directed learning and epistemic growth. Here is a transparent breakdown of what data we collect, how it is processed, and how your privacy is protected.
        </p>
      </header>

      <div className="info-content-card">
        <h2>1. Information We Collect</h2>
        <p>
          We only gather data essential to providing your learning and speech coaching experience:
        </p>
        <ul>
          <li>
            <strong>Account Credentials:</strong> When you register, we collect your name and email address. Passwords are never stored in plaintext; they are securely hashed using industry-standard bcrypt algorithms with salt rounds before database storage.
          </li>
          <li>
            <strong>Learning Reflections:</strong> When you submit a reflection on a topic, your entries for the four reflection pillars (What I Learned, What Surprised Me, My Opinion, and Questions Remaining) are saved to your private MongoDB learning session records.
          </li>
          <li>
            <strong>Speech Audio Recordings &amp; Transcripts:</strong> When practicing in Speech Lab, your microphone audio is recorded locally in your browser slices and transmitted to our server to generate an automated transcription and AI argument evaluation.
          </li>
        </ul>

        <h2>2. Speech Data Processing, Retention &amp; Deletion</h2>
        <p>
          We believe in strict, verified data minimization for voice recordings:
        </p>
        <ul>
          <li>
            <strong>Temporary File Lifecycle:</strong> Uploaded speech audio is written to a private server directory (<code>Backend/uploads/audio/</code>) solely to allow asynchronous transcription and evaluation by Google Gemini.
          </li>
          <li>
            <strong>Automated Disk Deletion:</strong> As soon as the AI analysis finishes successfully, the temporary audio file is permanently deleted from server disk storage. Audio files are not archived or retained indefinitely on our file systems.
          </li>
          <li>
            <strong>Transcripts &amp; Coaching Reports:</strong> The generated text transcript, scores, and structural suggestions remain stored in your private MongoDB speech session document so you can review your progress across past sessions.
          </li>
        </ul>

        <h2>3. Third-Party AI Services</h2>
        <p>
          BrainDetour integrates with <strong>Google Gemini API</strong> for high-accuracy speech transcription and epistemic reasoning evaluation. Audio and transcript payloads transmitted to Gemini are processed according to Google’s enterprise API data privacy agreements and are not utilized to train public foundational models.
        </p>

        <h2>4. Session Isolation &amp; Cookie Security</h2>
        <p>
          User sessions are strictly isolated at the database query level (matching <code>req.user._id</code>). No user can access or view another scholar&apos;s reflections, speech sessions, or history. Authentication relies on secure, HttpOnly, SameSite cookies with a 7-minute access token lifespan and single-use 15-day refresh tokens.
        </p>

        <h2>5. Your Privacy Rights &amp; Contact</h2>
        <p>
          You have the right to request a summary of your stored data or request the deletion of your account and associated session histories at any time.
        </p>
        <p>
          For any questions, concerns, or data deletion requests, contact our privacy maintainers at:
        </p>
        <p>
          <a
            href="mailto:braindetour2026@gmail.com?subject=Privacy%20Inquiry"
            className="contact-card__email-link"
          >
            ✉️ braindetour2026@gmail.com
          </a>
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-6)' }}>
          Last updated: October 2026 &bull; BrainDetour Platform
        </p>
      </div>
    </div>
  )
}

