import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuth } from '../hooks/useAuth'
import { TopicWheel } from '../features/discovery/components/TopicWheel'
import { HeroBackground } from '../components/ui/HeroBackground'
import { Button } from '../components/ui/Button'
import './Pages.css'

export function HomePage() {
  usePageTitle('Curiosity Engine')
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const handleSpeechPracticeClick = () => {
    if (isAuthenticated) {
      navigate('/presentation')
    } else {
      navigate('/login', { state: { from: '/presentation' } })
    }
  }

  return (
    <div className="home-page home-page--immersive">
      {/* 1. Open Hero Experience: Wheel Centered Directly on Ambient Background */}
      <section className="hero-immersive" aria-label="Curiosity Discovery Wheel">
        <HeroBackground />

        <div className="hero-immersive__header">
          <h1 className="hero-immersive__title">
            Curiosity starts with one spin.
          </h1>
        </div>

        {/* Wheel Centered in Hero Viewport */}
        <div className="hero-wheel-stage">
          <TopicWheel />
        </div>
      </section>

      {/* 2. Open Editorial Sections (No Outer Boxes or Feature Cards) */}
      <div className="home-editorial-flow">
        {/* Section 1: About BrainDetour (Open Editorial Storytelling Layout) */}
        <section className="about-open-section" aria-labelledby="about-heading">
          <div className="about-editorial-header">
            <div className="section-eyebrow">
              <span className="section-eyebrow__dot" />
              <span>The Idea Behind BrainDetour</span>
            </div>
            <h2 id="about-heading" className="about-open-section__title">
              Follow your curiosity. Discover a new perspective.
            </h2>
            <p className="about-open-section__lead">
              BrainDetour turns a simple spin into an opportunity to explore unfamiliar ideas, learn from original sources, and develop your own perspective.
            </p>
          </div>

          <div className="about-concepts-track" role="list">
            <div className="about-concept-step" role="listitem">
              <div className="about-concept-step__marker">
                <span className="about-concept-step__num">01</span>
                <span className="about-concept-step__icon" aria-hidden="true">🧭</span>
              </div>
              <div className="about-concept-step__content">
                <h3 className="about-concept-step__title">Discover</h3>
                <p className="about-concept-step__desc">
                  Find an unexpected topic beyond your usual interests.
                </p>
              </div>
            </div>

            <div className="about-concept-connector" aria-hidden="true" />

            <div className="about-concept-step" role="listitem">
              <div className="about-concept-step__marker">
                <span className="about-concept-step__num">02</span>
                <span className="about-concept-step__icon" aria-hidden="true">📖</span>
              </div>
              <div className="about-concept-step__content">
                <h3 className="about-concept-step__title">Understand</h3>
                <p className="about-concept-step__desc">
                  Explore useful research and original sources to build your understanding.
                </p>
              </div>
            </div>

            <div className="about-concept-connector" aria-hidden="true" />

            <div className="about-concept-step" role="listitem">
              <div className="about-concept-step__marker">
                <span className="about-concept-step__num">03</span>
                <span className="about-concept-step__icon" aria-hidden="true">💭</span>
              </div>
              <div className="about-concept-step__content">
                <h3 className="about-concept-step__title">Reflect</h3>
                <p className="about-concept-step__desc">
                  Capture what you learned, question your assumptions, and develop your own ideas.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: How It Works (Clean Horizontal Sequence) */}
        <section className="how-open-section" aria-labelledby="how-heading">
          <div className="how-open-section__header">
            <div className="section-eyebrow">
              <span className="section-eyebrow__dot" />
              <span>Learning Cycle</span>
            </div>
            <h2 id="how-heading" className="how-open-section__title">How It Works</h2>
            <p className="how-open-section__lead">
              A four-stage learning loop transforming passive media consumption into active, reasoned understanding.
            </p>
          </div>

          <div className="how-timeline">
            {/* Horizontal connecting track line behind steps */}
            <div className="how-timeline__track" aria-hidden="true" />

            <div className="how-step">
              <div className="how-step__marker">
                <span className="how-step__num">01</span>
              </div>
              <h3 className="how-step__title">Spin to Discover</h3>
              <p className="how-step__desc">
                Engage the wheel to uncover an unexpected inquiry track beyond your usual reading habits.
              </p>
            </div>

            <div className="how-step">
              <div className="how-step__marker">
                <span className="how-step__num">02</span>
              </div>
              <h3 className="how-step__title">Research & Read</h3>
              <p className="how-step__desc">
                Examine reputable primary sources, encyclopedic entries, and empirical study abstracts.
              </p>
            </div>

            <div className="how-step">
              <div className="how-step__marker">
                <span className="how-step__num">03</span>
              </div>
              <h3 className="how-step__title">Reflect & Record</h3>
              <p className="how-step__desc">
                Document what you learned, what surprised you, and your own reasoned opinions.
              </p>
            </div>

            <div className="how-step">
              <div className="how-step__marker">
                <span className="how-step__num">04</span>
              </div>
              <h3 className="how-step__title">Practice Presenting</h3>
              <p className="how-step__desc">
                Draft or speak your thesis and evaluate its clarity and evidence in the Speech Practice Lab.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Speech Practice (Open Presentation Lab) */}
        <section className="speech-open-section" aria-labelledby="speech-heading">
          <div className="speech-open-section__content">
            <div className="speech-open-section__header">
              <div className="section-eyebrow">
                <span className="section-eyebrow__dot" />
                <span>Mastery Through Expression</span>
              </div>
              <h2 id="speech-heading" className="speech-open-section__title">
                Practice Your Speech
              </h2>
              <p className="speech-open-section__lead">
                Explaining what you know is the highest form of mastery. Rehearse articulating your insights aloud and receive structured AI-assisted feedback on:
              </p>
            </div>

            <div className="speech-criteria-grid">
              <div className="speech-criterion">
                <span className="speech-criterion__icon" aria-hidden="true">🎯</span>
                <div className="speech-criterion__body">
                  <h4 className="speech-criterion__title">Clarity & Conciseness</h4>
                  <p className="speech-criterion__desc">Express complex ideas succinctly without jargon overload or confusing sentence syntax.</p>
                </div>
              </div>

              <div className="speech-criterion">
                <span className="speech-criterion__icon" aria-hidden="true">📐</span>
                <div className="speech-criterion__body">
                  <h4 className="speech-criterion__title">Structure & Logic</h4>
                  <p className="speech-criterion__desc">Build an organic narrative arc from an engaging opening hook through empirical evidence to a conclusion.</p>
                </div>
              </div>

              <div className="speech-criterion">
                <span className="speech-criterion__icon" aria-hidden="true">🧭</span>
                <div className="speech-criterion__body">
                  <h4 className="speech-criterion__title">Topic Relevance</h4>
                  <p className="speech-criterion__desc">Keep your speech sharply focused on the core inquiry question without wandering into tangential claims.</p>
                </div>
              </div>

              <div className="speech-criterion">
                <span className="speech-criterion__icon" aria-hidden="true">🔬</span>
                <div className="speech-criterion__body">
                  <h4 className="speech-criterion__title">Evidence Quality</h4>
                  <p className="speech-criterion__desc">Differentiate empirical claims supported by peer-reviewed literature from unbacked assertions.</p>
                </div>
              </div>

              <div className="speech-criterion">
                <span className="speech-criterion__icon" aria-hidden="true">💡</span>
                <div className="speech-criterion__body">
                  <h4 className="speech-criterion__title">Actionable Recommendations</h4>
                  <p className="speech-criterion__desc">Concrete recommendations to strengthen your thesis argument, rhetorical delivery, and resonance.</p>
                </div>
              </div>
            </div>

            <div className="speech-open-section__footer">
              <p className="speech-disclaimer-note">
                <em>* Note: Evaluation analyzes semantic structure, thesis coherence, and empirical claims from your transcript; it does not grade acoustic vocal timbre or pronunciation.</em>
              </p>
              <div className="speech-actions-row">
                <Button variant="primary" size="lg" onClick={handleSpeechPracticeClick}>
                  Practice Your Speech &rarr;
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  ✦ Spin Curiosity Wheel
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
