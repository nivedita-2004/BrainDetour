import { Link } from 'react-router-dom'
import { Card, CardContent } from '../../components/ui/Card'
import { formatMinutes } from '../../lib/utils'
import './TopicCard.css'

/**
 * TopicCard component
 * Compact, highly consistent topic summary card for curiosity catalog.
 */
export function TopicCard({ topic }) {
  if (!topic) return null

  return (
    <Card hoverable className="topic-card">
      <CardContent className="topic-card__content">
        <div className="topic-card__header">
          <span className="topic-card__category">{topic.category}</span>
          <span className="topic-card__difficulty">{topic.difficulty}</span>
        </div>

        <h3 className="topic-card__title">
          <Link to={`/topics/${topic.id}`} className="topic-card__title-link">
            {topic.title}
          </Link>
        </h3>

        <p className="topic-card__summary">{topic.summary}</p>

        <div className="topic-card__footer">
          <span className="topic-card__time">⏱ {formatMinutes(topic.estimatedMinutes)}</span>
          <Link to={`/topics/${topic.id}`} className="topic-card__cta">
            Explore Topic &rarr;
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
