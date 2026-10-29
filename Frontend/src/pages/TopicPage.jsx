import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { getMockTopicById } from '../services/mock/topicService'
import { mockResearchService } from '../services/mock/researchService'
import { CuriosityPrompt } from '../features/learning/CuriosityPrompt'
import { ReflectionForm } from '../features/learning/ReflectionForm'
import { Button } from '../components/ui/Button'
import { formatMinutes } from '../lib/utils'
import './Pages.css'

export function TopicPage() {
  const { topicId } = useParams()
  const navigate = useNavigate()
  const [topic, setTopic] = useState(null)
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingSources, setLoadingSources] = useState(true)
  const [prevTopicId, setPrevTopicId] = useState(topicId)

  // Reading Timer states
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [isTimerActive, setIsTimerActive] = useState(false)

  if (topicId !== prevTopicId) {
    setPrevTopicId(topicId)
    setLoading(true)
    setLoadingSources(true)
    setTopic(null)
    setSources([])
    setSecondsLeft(null)
    setIsTimerActive(false)
  }

  usePageTitle(topic ? topic.title : 'Topic Details')

  useEffect(() => {
    let isMounted = true

    // Retrieve topic details, resolving against live backend topic database if available
    async function loadTopicDetails() {
      const mockResult = await getMockTopicById(topicId)
      if (isMounted && mockResult) {
        setTopic(mockResult)
        setLoading(false)
        if (mockResult?.estimatedMinutes) {
          setSecondsLeft(mockResult.estimatedMinutes * 60)
        }
      }

      try {
        const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.topic && isMounted) {
            setTopic((prev) => ({
              ...(prev || {}),
              ...data.topic,
              _id: data.topic._id || data.topic.id,
              id: data.topic.id || data.topic._id,
            }))
            setLoading(false)
          }
        }
      } catch (_) {
        // Fall back cleanly to mock data if backend topic lookup is unreachable
      }
    }

    loadTopicDetails()

    mockResearchService.getResearchByTopicId(topicId).then((result) => {
      if (isMounted) {
        setSources(result)
        setLoadingSources(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [topicId])

  useEffect(() => {
    let interval = null
    if (isTimerActive && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsTimerActive(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isTimerActive, secondsLeft])

  const handleResetTimer = () => {
    setIsTimerActive(false)
    if (topic?.estimatedMinutes) {
      setSecondsLeft(topic.estimatedMinutes * 60)
    }
  }

  if (loading) {
    return (
      <div className="page-state">
        <p className="page-state__text">Loading topic details & citations…</p>
      </div>
    )
  }

  if (!topic) {
    return (
      <div className="page-state">
        <h2>Topic Not Found</h2>
        <p className="page-state__text">
          We could not find an inquiry topic with the identifier &ldquo;{topicId}&rdquo;.
        </p>
        <Link to="/explore">
          <Button variant="primary">Return to Explore Catalog</Button>
        </Link>
      </div>
    )
  }

  const totalSecs = secondsLeft ?? (topic.estimatedMinutes * 60)
  const displayMins = Math.floor(totalSecs / 60)
  const displaySecs = totalSecs % 60
  const formattedTimer = `${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`

  return (
    <article className="topic-detail">
      {/* Top Breadcrumb & Reading Session Timer */}
      <div className="topic-detail__top-nav">
        <Link to="/" className="topic-detail__back">
          &larr; Back to Curiosity Wheel
        </Link>

        <div className="topic-reading-timer" role="region" aria-label="Reading Session Timer">
          <span className="topic-reading-timer__label">Reading Timer:</span>
          <span className={`topic-reading-timer__time ${isTimerActive ? 'topic-reading-timer__time--active' : ''}`}>
            {formattedTimer}
          </span>
          <button
            type="button"
            className="topic-reading-timer__btn"
            onClick={() => setIsTimerActive((prev) => !prev)}
            aria-label={isTimerActive ? 'Pause focus timer' : 'Start focus timer'}
          >
            {isTimerActive ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            className="topic-reading-timer__btn topic-reading-timer__btn--secondary"
            onClick={handleResetTimer}
            aria-label="Reset focus timer"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Header Overview */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="topic-detail__meta">
          <span className="page-header__badge">{topic.category}</span>
          <span className="topic-card__difficulty">{topic.difficulty}</span>
          <span className="topic-card__time">⏱ {formatMinutes(topic.estimatedMinutes)} read</span>
        </div>
        <h1 className="page-header__title">{topic.title}</h1>
        <p className="page-header__description">{topic.summary}</p>
      </header>

      {/* Core Inquiry Overview */}
      <section className="topic-detail__content">
        <div className="topic-detail__body-text">
          <p>{topic.description}</p>
        </div>

        <CuriosityPrompt
          prompt={topic.evidencePrompt}
          questions={topic.keyQuestions}
        />

        {topic.tags && topic.tags.length > 0 && (
          <div className="topic-detail__tag-list">
            {topic.tags.map((tag) => (
              <span key={tag} className="topic-detail__tag">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Dedicated Research Results Section (2 to 5 Academic Sources) */}
      <section className="research-sources-section" aria-labelledby="research-heading">
        <div className="research-sources-header">
          <div>
            <span className="home-sub-card__badge">Curated Literature</span>
            <h2 id="research-heading" className="research-sources-title">
              Primary Research & Academic Sources
            </h2>
            <p className="research-sources-subtitle">
              Verified external citations to foundational papers, encyclopedic entries, and empirical findings. Read the original publishers directly.
            </p>
          </div>
          <span className="mock-data-pill">Verified Mock Citations</span>
        </div>

        {loadingSources ? (
          <p className="page-state__text">Fetching academic sources…</p>
        ) : sources.length === 0 ? (
          <div className="research-empty-state">
            <p>No external sources currently indexed for this topic.</p>
          </div>
        ) : (
          <div className="research-sources-grid">
            {sources.map((src) => (
              <div key={src.id} className="research-source-card">
                <div className="research-source-card__meta">
                  <span className="research-source-publisher">{src.publisher}</span>
                  {src.publishedYear && (
                    <span className="research-source-year">&bull; {src.publishedYear}</span>
                  )}
                </div>

                <h3 className="research-source-card__title">{src.title}</h3>
                <p className="research-source-card__excerpt">{src.excerpt}</p>

                <div className="research-source-card__action">
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="research-source-link"
                      aria-label={`Open original source: ${src.title} (opens in new tab)`}
                    >
                      <span>Open Original Source</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  ) : (
                    <span className="research-source-unavailable">Citation details pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dedicated Personal Reflection Workspace */}
      <ReflectionForm topicId={topic.id} topicTitle={topic.title} />

      {/* Direct Speech Practice Action Bar */}
      <div className="topic-practice-bridge">
        <div className="topic-practice-bridge__info">
          <h3>Ready to articulate your thesis?</h3>
          <p>Test your argument structure, factual claims, and clarity in the Speech Practice Lab.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            navigate('/presentation', {
              state: {
                topic,
                topicId: topic._id || topic.id || topic.slug,
                topicTitle: topic.title,
                thesis: `Topic: ${topic.title}\nCategory: ${topic.category}\n\nKey Inquiry Question:\n${topic.evidencePrompt || ''}`,
              },
            })
          }}
        >
          Practice Explaining This Topic &rarr;
        </Button>
      </div>
    </article>
  )
}
