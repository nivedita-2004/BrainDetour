import { Link } from 'react-router-dom'
import { APP_CONFIG, FOOTER_LINKS, SUPPORT_EMAIL } from '../../lib/constants'
import './Footer.css'

/**
 * Shared minimal application footer.
 * Renders an unobtrusive horizontal divider, tagline, essential navigation links,
 * clickable contact email, and copyright notice across all BrainDetour pages.
 */
export function Footer() {
  const currentYear = new Date().getFullYear()

  /**
   * Smoothly scroll to the top of the page where the content starts when clicking footer links
   */
  const handleFooterLinkClick = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    } catch (_) {
      window.scrollTo(0, 0)
    }

    // Schedule across next render frames to ensure new route content smoothly scrolls to top
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
      } catch (_) {
        window.scrollTo(0, 0)
      }
    })

    setTimeout(() => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
      } catch (_) {
        window.scrollTo(0, 0)
      }
    }, 60)
  }

  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer__container">
        {/* Left: Brand & Tagline */}
        <div className="app-footer__left">
          <span className="app-footer__brand">{APP_CONFIG.name}</span>
          <span className="app-footer__sep" aria-hidden="true">•</span>
          <span className="app-footer__tagline">{APP_CONFIG.tagline}</span>
        </div>

        {/* Center: Essential Navigation Links */}
        <nav className="app-footer__nav" aria-label="Footer Navigation">
          {FOOTER_LINKS.map((link, idx) => (
            <span key={link.path} className="app-footer__nav-item">
              {idx > 0 && <span className="app-footer__sep" aria-hidden="true">•</span>}
              <Link
                to={link.path}
                className="app-footer__link"
                onClick={handleFooterLinkClick}
              >
                {link.label}
              </Link>
            </span>
          ))}
        </nav>

        {/* Right: Contact Email & Copyright */}
        <div className="app-footer__right">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="app-footer__link app-footer__email"
            title="Email BrainDetour Support"
          >
            {SUPPORT_EMAIL}
          </a>
          <span className="app-footer__sep" aria-hidden="true">•</span>
          <span className="app-footer__copyright">
            &copy; {currentYear} {APP_CONFIG.name}. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  )
}
