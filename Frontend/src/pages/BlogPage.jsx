import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { mockBlogService } from '../services/mock/blogService'
import { Button } from '../components/ui/Button'
import './Pages.css'

export function BlogPage() {
  usePageTitle('The Detour Journal — Essays & Insights')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    mockBlogService.getBlogPosts().then((data) => {
      if (isMounted) {
        setPosts(data)
        setLoading(false)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="blog-page">
      <header className="page-header page-header--centered">
        <span className="page-header__badge">The Detour Journal</span>
        <h1 className="page-header__title">Essays on Curiosity & Epistemic Rigor</h1>
        <p className="page-header__description">
          Dispatches examining how serendipity, cognitive heuristics, and structured speech empower modern self-directed scholars.
        </p>
      </header>

      {loading ? (
        <div className="page-state">
          <p className="page-state__text">Loading journal essays…</p>
        </div>
      ) : (
        <div className="blog-grid">
          {posts.map((post) => (
            <article key={post.id} className="blog-card">
              <div className="blog-card__header">
                <span className="blog-card__category">{post.category}</span>
                <span className="blog-card__time">⏱ {post.readTimeMinutes} min read</span>
              </div>

              <h2 className="blog-card__title">
                <Link to={`/blog/${post.slug}`} className="blog-card__title-link">
                  {post.title}
                </Link>
              </h2>

              <p className="blog-card__excerpt">{post.excerpt}</p>

              <div className="blog-card__footer">
                <div className="blog-card__author-info">
                  <span className="blog-card__author-name">{post.author.name}</span>
                  <span className="blog-card__date">
                    {new Date(post.publishedDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <Link to={`/blog/${post.slug}`}>
                  <Button variant="ghost" size="sm">
                    Read Essay &rarr;
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Cross-Link Back to the Wheel */}
      <div className="blog-cta-banner">
        <div>
          <h3>Inspired to test your curiosity?</h3>
          <p>Spin the multidisciplinary wheel to encounter your next serendipitous inquiry.</p>
        </div>
        <Link to="/">
          <Button variant="primary" size="md">
            ✦ Spin the Wheel &rarr;
          </Button>
        </Link>
      </div>
    </div>
  )
}
