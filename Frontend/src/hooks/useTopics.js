import { useState, useEffect } from 'react'
import { getMockTopics, getMockTopicsByCategory } from '../services/mock/topicService'

/**
 * Reusable hook to fetch and filter curiosity topics from mock services.
 * Keeps data access separate from page presentation.
 * @param {string} [category='All']
 * @returns {{ topics: Array, loading: boolean, error: string|null }}
 */
export function useTopics(category = 'All') {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [prevCategory, setPrevCategory] = useState(category)

  if (category !== prevCategory) {
    setPrevCategory(category)
    setLoading(true)
    setError(null)
  }

  useEffect(() => {
    let isMounted = true

    const fetcher = category === 'All' ? getMockTopics() : getMockTopicsByCategory(category)

    fetcher
      .then((data) => {
        if (isMounted) {
          setTopics(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.message || 'Failed to fetch topics')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [category])

  return { topics, loading, error }
}
