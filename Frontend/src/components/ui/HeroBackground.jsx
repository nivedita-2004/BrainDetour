import './HeroBackground.css'

/**
 * HeroBackground Component
 * 
 * Provides an ethereal, dreamy ambient background layer with soft floating orbs,
 * delicate concentric orbital rings, and slowly twinkling celestial sparkles.
 * The animation's visual center is aligned with the TopicWheel's center.
 * Completely pointer-events: none, GPU-accelerated, and respects prefers-reduced-motion.
 */
export function HeroBackground() {
  return (
    <div className="hero-background" aria-hidden="true">
      {/* Floating Ambient Light Orbs */}
      <div className="hero-orb hero-orb--lavender" />
      <div className="hero-orb hero-orb--rose" />
      <div className="hero-orb hero-orb--center" />

      {/* Concentric Orbit Lines perfectly centered with the wheel center */}
      <svg
        className="hero-orbits-svg"
        viewBox="0 0 1000 1000"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="500" cy="500" r="370" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 8" className="orbit-ring orbit-ring--inner" />
        <circle cx="500" cy="500" r="425" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" className="orbit-ring orbit-ring--mid" />
        <circle cx="500" cy="500" r="480" stroke="currentColor" strokeWidth="0.75" className="orbit-ring orbit-ring--outer" />
      </svg>

      {/* Twinkling Celestial Sparkles framing the wheel */}
      <div className="hero-sparkles">
        <span className="sparkle sparkle--1" style={{ top: '10%', left: '20%' }} />
        <span className="sparkle sparkle--2" style={{ top: '15%', right: '18%' }} />
        <span className="sparkle sparkle--3" style={{ top: '40%', left: '14%' }} />
        <span className="sparkle sparkle--4" style={{ top: '44%', right: '16%' }} />
        <span className="sparkle sparkle--5" style={{ top: '8%', left: '50%' }} />
        <span className="sparkle sparkle--6" style={{ top: '70%', left: '20%' }} />
        <span className="sparkle sparkle--7" style={{ top: '68%', right: '20%' }} />
        <span className="sparkle sparkle--8" style={{ top: '82%', left: '50%' }} />
      </div>
    </div>
  )
}
