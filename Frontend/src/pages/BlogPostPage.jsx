import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { mockBlogService } from '../services/mock/blogService'
import { Button } from '../components/ui/Button'
import './Pages.css'

export function BlogPostPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)

  usePageTitle(post ? post.title : 'Journal Essay')

  useEffect(() => {
    let isMounted = true
    mockBlogService.getBlogPostBySlug(slug).then((data) => {
      if (isMounted) {
        setPost(data)
        setLoading(false)
      }
    })
    return () => {
      isMounted = false
    }
  }, [slug])

  if (loading) {
    return (
      <div className="page-state">
        <p className="page-state__text">Loading essay…</p>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="page-state">
        <h2>Essay Not Found</h2>
        <p className="page-state__text">
          We could not find an essay matching &ldquo;{slug}&rdquo;.
        </p>
        <Link to="/blog">
          <Button variant="primary">Return to Journal Listing</Button>
        </Link>
      </div>
    )
  }

  return (
    <article className="blog-post-detail">
      <Link to="/blog" className="topic-detail__back">
        &larr; Back to Journal Listing
      </Link>

      <header className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="topic-detail__meta">
          <span className="page-header__badge">{post.category}</span>
          <span className="topic-card__time">⏱ {post.readTimeMinutes} min read</span>
          <span className="blog-card__date">
            {new Date(post.publishedDate).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
        <h1 className="page-header__title" style={{ fontSize: 'clamp(1.5rem, 4.5vw, 2.4rem)', lineHeight: 1.2 }}>
          {post.title}
        </h1>
        <div className="blog-post-author-bar">
          <div className="blog-post-author-avatar">
            {post.author.name.charAt(0)}
          </div>
          <div>
            <div className="blog-post-author-name">{post.author.name}</div>
            <div className="blog-post-author-role">{post.author.role}</div>
          </div>
        </div>
      </header>

      <div className="blog-post-body">
        {post.content.split('\n\n').map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}
      </div>

      {post.tags && (
        <div className="topic-detail__tag-list" style={{ marginTop: 'var(--space-8)' }}>
          {post.tags.map((tag) => (
            <span key={tag} className="topic-detail__tag">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Cross-Link Back to the Wheel */}
      <div className="blog-cta-banner" style={{ marginTop: 'var(--space-10)' }}>
        <div>
          <h3>Ready for an intellectual detour?</h3>
          <p>Spin the BrainDetour wheel and discover empirical literature in real time.</p>
        </div>
        <Link to="/">
          <Button variant="primary" size="md">
            ✦ Spin Curiosity Wheel &rarr;
          </Button>
        </Link>
      </div>
    </article>
  )
}
