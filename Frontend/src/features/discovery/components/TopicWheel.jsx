import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { WHEEL_SEGMENTS } from '../../../lib/constants'
import { MOCK_TOPICS } from '../../../data/mock/topics'
import { mockResearchService } from '../../../services/mock/researchService'
import { Button } from '../../../components/ui/Button'
import './TopicWheel.css'

/**
 * TopicWheel Component
 *
 * An interactive, physics-inspired circular curiosity wheel.
 * Rotates smoothly and deterministically maps the final rotation angle
 * to the exact segment landed beneath the top fixed pointer.
 */
export function TopicWheel({ onTopicSelected }) {
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [selectedSegment, setSelectedSegment] = useState(null)
  const [researchSources, setResearchSources] = useState([])
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return false
  })
  const spinTimeoutRef = useRef(null)
  const resultRef = useRef(null)

  const numSegments = WHEEL_SEGMENTS.length
  const segmentAngle = 360 / numSegments

  // Check for reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
    }
  }, [])

  /**
   * Calculates the winning segment and matching mock topic from the final rotation angle.
   * Fixed pointer is at the top (12 o'clock = 270 degrees in SVG coordinates).
   */
  const resolveWinningTopic = (finalRotation) => {
    const normalizedAngle = ((270 - (finalRotation % 360)) % 360 + 360) % 360
    const winningIndex = Math.floor(normalizedAngle / segmentAngle) % numSegments
    const winningSegment = WHEEL_SEGMENTS[winningIndex]

    // Find topic corresponding to this category in MOCK_TOPICS
    const matchingTopics = MOCK_TOPICS.filter((t) => t.category === winningSegment.category)
    const topic = matchingTopics.length > 0
      ? matchingTopics[Math.floor(Math.random() * matchingTopics.length)]
      : MOCK_TOPICS[0] // fallback if none

    setSelectedSegment(winningSegment)
    setSelectedTopic(topic)

    // Preload curated academic sources for this topic
    mockResearchService.getResearchByTopicId(topic.id).then((sources) => {
      setResearchSources(sources || [])
    })

    if (onTopicSelected) onTopicSelected(topic)
  }

  // Smoothly scroll down to bring the result card and research content into view
  // Only triggers after the spin animation completes and the card renders
  useEffect(() => {
    if (selectedTopic && !isSpinning && resultRef.current) {
      const scrollTimer = setTimeout(() => {
        if (!resultRef.current) return
        const navbarOffset = 76
        const rect = resultRef.current.getBoundingClientRect()
        const targetY = window.pageYOffset + rect.top - navbarOffset

        window.scrollTo({
          top: Math.max(0, targetY),
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        })
      }, 120)

      return () => clearTimeout(scrollTimer)
    }
  }, [selectedTopic, isSpinning, prefersReducedMotion])

  const handleSpin = () => {
    if (isSpinning) return

    setSelectedTopic(null)
    setIsSpinning(true)

    // Generate random 5-8 full spins + random degree offset
    const randomRotations = 5 + Math.floor(Math.random() * 3)
    const randomDegrees = Math.floor(Math.random() * 360)
    const nextRotation = rotation + randomRotations * 360 + randomDegrees

    if (prefersReducedMotion) {
      setRotation(nextRotation)
      resolveWinningTopic(nextRotation)
      setIsSpinning(false)
    } else {
      setRotation(nextRotation)
      const duration = 3800 // 3.8s animation duration
      spinTimeoutRef.current = setTimeout(() => {
        resolveWinningTopic(nextRotation)
        setIsSpinning(false)
      }, duration)
    }
  }

  // Precompute SVG segment wedge paths
  const radius = 180
  const center = 200

  return (
    <div className="topic-wheel-container">
      {/* Pointer at the top */}
      <div className="wheel-pointer" aria-hidden="true">
        <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
          <path
            d="M17 40L3 14C0.5 9 4 3 10 3H24C30 3 33.5 9 31 14L17 40Z"
            fill="#7253A8"
            stroke="#FFF8F0"
            strokeWidth="3"
          />
          <circle cx="17" cy="14" r="5" fill="#F2B8C8" />
        </svg>
      </div>

      {/* Rotating Wheel Frame */}
      <div className="wheel-outer-ring">
        <div
          className={`wheel-disc ${isSpinning ? 'wheel-disc--spinning' : ''}`}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: prefersReducedMotion
              ? 'none'
              : 'transform 3.8s cubic-bezier(0.15, 0.9, 0.2, 1)',
          }}
          role="img"
          aria-label="Curiosity topic discovery wheel"
        >
          <svg
            viewBox="0 0 400 400"
            className="wheel-svg"
            width="100%"
            height="100%"
          >
            <defs>
              <filter id="hub-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#7253A8" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Segments */}
            {WHEEL_SEGMENTS.map((seg, i) => {
              const startAngle = i * segmentAngle
              const endAngle = (i + 1) * segmentAngle
              const startRad = (startAngle * Math.PI) / 180
              const endRad = (endAngle * Math.PI) / 180

              const x1 = center + radius * Math.cos(startRad)
              const y1 = center + radius * Math.sin(startRad)
              const x2 = center + radius * Math.cos(endRad)
              const y2 = center + radius * Math.sin(endRad)

              // Text label placement
              const midAngle = startAngle + segmentAngle / 2
              const midRad = (midAngle * Math.PI) / 180
              const textR = radius * 0.65
              const tx = center + textR * Math.cos(midRad)
              const ty = center + textR * Math.sin(midRad)

              return (
                <g key={seg.id} className="wheel-segment">
                  <path
                    d={`M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
                    fill={seg.color}
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                  />
                  {/* Segment icon and canonical label */}
                  <g transform={`translate(${tx}, ${ty}) rotate(${midAngle + 90})`}>
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={seg.textColor}
                      fontSize="10.5"
                      fontWeight="700"
                      fontFamily="Inter, sans-serif"
                      letterSpacing="-0.02em"
                    >
                      {seg.icon} {seg.label}
                    </text>
                  </g>
                </g>
              )
            })}

            {/* Center Decorative Hub */}
            <circle
              cx={center}
              cy={center}
              r="46"
              fill="#FFF8F0"
              stroke="#E2D3F0"
              strokeWidth="3"
              filter="url(#hub-shadow)"
            />
            <circle
              cx={center}
              cy={center}
              r="34"
              fill="url(#hub-grad)"
              fillOpacity="0.1"
            />
            <circle
              cx={center}
              cy={center}
              r="14"
              fill="#9270C8"
            />
            <circle
              cx={center}
              cy={center}
              r="6"
              fill="#FFF8F0"
            />
          </svg>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="wheel-action-wrapper">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSpin}
          disabled={isSpinning}
          className="wheel-spin-btn"
        >
          {isSpinning ? 'Exploring detours…' : '✦ Spin to Discover'}
        </Button>
      </div>

      {/* Winning Result Card with Research Content & Speech Lab Link */}
      {selectedTopic && selectedSegment && (
        <div
          ref={resultRef}
          className="wheel-result-card"
          role="region"
          aria-live="polite"
          style={{ scrollMarginTop: '80px' }}
        >
          <div className="wheel-result-header">
            <span
              className="wheel-result-badge"
              style={{ backgroundColor: selectedSegment.color, color: selectedSegment.textColor }}
            >
              {selectedSegment.icon} {selectedSegment.category}
            </span>
            <span className="wheel-result-detour">✦ Detour Discovered!</span>
          </div>

          <h3 className="wheel-result-title">{selectedTopic.title}</h3>
          <p className="wheel-result-summary">{selectedTopic.summary}</p>

          {/* Research Inquiry Focus */}
          {selectedTopic.evidencePrompt && (
            <div className="wheel-result-inquiry">
              <span className="wheel-result-inquiry-label">Inquiry Question:</span>
              <p className="wheel-result-inquiry-text">&ldquo;{selectedTopic.evidencePrompt}&rdquo;</p>
            </div>
          )}

          {/* Curated Academic Sources Highlights */}
          {researchSources.length > 0 && (
            <div className="wheel-result-sources">
              <span className="wheel-result-sources-label">Curated Academic Evidence:</span>
              <ul className="wheel-result-sources-list">
                {researchSources.slice(0, 2).map((s) => (
                  <li key={s.id} className="wheel-result-source-item">
                    <span className="wheel-result-source-bullet">&bull;</span>
                    <div>
                      <strong className="wheel-result-source-title">{s.title}</strong>
                      <span className="wheel-result-source-meta"> — {s.publisher} ({s.publishedYear})</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="wheel-result-footer">
            <Link to={`/topics/${selectedTopic.id}`}>
              <Button variant="primary" size="md">
                Explore Full Research & Evidence &rarr;
              </Button>
            </Link>
            <Link
              to="/presentation"
              state={{
                topic: selectedTopic,
                topicId: selectedTopic.id,
                topicTitle: selectedTopic.title,
                thesis: selectedTopic.evidencePrompt,
              }}
            >
              <Button variant="outline" size="md">
                🎙 Practice Speech on This Topic
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSpin} disabled={isSpinning}>
              Spin Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
