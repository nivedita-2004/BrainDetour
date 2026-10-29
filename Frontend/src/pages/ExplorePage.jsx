import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useTopics } from '../hooks/useTopics'
import { TopicCard } from '../features/discovery/TopicCard'
import { TOPIC_CATEGORIES } from '../lib/constants'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import './Pages.css'

export function ExplorePage() {
  usePageTitle('Explore Topics')
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const { topics, loading, error } = useTopics(selectedCategory)

  const searchIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.3-4.3"/>
    </svg>
  )

  const handleRandomSpin = () => {
    if (topics.length > 0) {
      const randomIndex = Math.floor(Math.random() * topics.length)
      const randomTopic = topics[randomIndex]
      navigate(`/topics/${randomTopic.id}`)
    }
  }

  const filteredTopics = topics.filter((t) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      t.title.toLowerCase().includes(query) ||
      t.summary.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query) ||
      (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(query)))
    )
  })

  return (
    <div className="explore-page">
      <header className="page-header">
        <span className="page-header__badge">Discovery Catalog</span>
        <h1 className="page-header__title">Curiosity & Inquiry Topics</h1>
        <p className="page-header__description">
          Browse structured inquiry modules across cognitive science, AI evidence synthesis, and scientific epistemology.
        </p>
      </header>

      {/* Compact Search & Category Filter Toolbar */}
      <div className="explore-controls">
        <div className="explore-toolbar">
          <div className="explore-search-bar">
            <Input
              id="explore-search"
              type="search"
              icon={searchIcon}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics, questions, or tags..."
            />
          </div>
          <Button variant="secondary" size="md" onClick={handleRandomSpin}>
            ✦ Spin Random Detour
          </Button>
        </div>

        <div className="category-filter" role="tablist" aria-label="Topic Categories">
          {TOPIC_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`category-filter__pill ${
                selectedCategory === cat ? 'category-filter__pill--active' : ''
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="page-state">
          <p className="page-state__text">Fetching curiosity topics…</p>
        </div>
      )}

      {error && (
        <div className="page-state">
          <p className="page-state__text">Error loading topics: {error}</p>
        </div>
      )}

      {!loading && !error && filteredTopics.length === 0 && (
        <div className="page-state">
          <p className="page-state__text">No topics match your current filter or search criteria.</p>
          {searchQuery && (
            <button
              type="button"
              className="page-state__clear-btn"
              onClick={() => setSearchQuery('')}
            >
              Clear Search Query
            </button>
          )}
        </div>
      )}

      {!loading && !error && filteredTopics.length > 0 && (
        <div className="topics-grid">
          {filteredTopics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </div>
  )
}
