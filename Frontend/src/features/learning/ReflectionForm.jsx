import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  fetchTopicLearningSession,
  startOrResumeLearningSession,
  saveSessionReflection,
} from '../../services/learningApiService'
import { Button } from '../../components/ui/Button'
import './ReflectionForm.css'

/**
 * ReflectionForm Component
 * 
 * Provides a structured 4-pillar reflection workspace:
 * 1. What I learned (whatILearned)
 * 2. What surprised me (whatSurprisedMe)
 * 3. My opinion or interpretation (myOpinion)
 * 4. Questions I still have (questionsRemaining)
 * 
 * Persists reflections permanently in MongoDB associated with the authenticated user's
 * learning session, while maintaining a debounced local storage draft safety net.
 */
export function ReflectionForm({ topicId, topicTitle }) {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  const [currentSession, setCurrentSession] = useState(null)
  const [reflection, setReflection] = useState(null)
  const [formData, setFormData] = useState({
    whatILearned: '',
    whatSurprisedMe: '',
    myOpinion: '',
    questionsRemaining: '',
  })
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState({ message: '', type: '' })

  const debounceTimerRef = useRef(null)
  const isDirtyRef = useRef(false)

  // Construct draft storage key scoped strictly to current user and topic
  const userId = user?._id || user?.id || 'guest'
  const draftStorageKey = `braindetour_reflection_draft_${userId}_${topicId}`

  // Load existing reflection from backend learning session on mount or topic change
  useEffect(() => {
    let isMounted = true

    async function loadSessionAndReflection() {
      // 1. Check local draft safety net
      let localDraft = null
      try {
        const storedDraft = localStorage.getItem(draftStorageKey)
        if (storedDraft) {
          localDraft = JSON.parse(storedDraft)
        }
      } catch (_) {}

      // 2. Fetch server-backed session if authenticated
      if (isAuthenticated && topicId) {
        try {
          const session = await fetchTopicLearningSession(topicId)
          if (!isMounted) return

          if (session) {
            setCurrentSession(session)
            const serverRef = session.reflection || {}
            const hasServerContent = Boolean(
              serverRef.whatILearned ||
              serverRef.whatSurprisedMe ||
              serverRef.myOpinion ||
              serverRef.questionsRemaining
            )

            // Compare timestamps: do not allow old draft to overwrite newer server version
            const serverUpdatedAt = session.updatedAt ? new Date(session.updatedAt).getTime() : 0
            const draftSavedAt = localDraft?.savedAt ? new Date(localDraft.savedAt).getTime() : 0

            if (localDraft?.fields && draftSavedAt > serverUpdatedAt) {
              // Newer uncommitted draft found
              setFormData({
                whatILearned: localDraft.fields.whatILearned || '',
                whatSurprisedMe: localDraft.fields.whatSurprisedMe || '',
                myOpinion: localDraft.fields.myOpinion || '',
                questionsRemaining: localDraft.fields.questionsRemaining || '',
              })
              setReflection(serverRef)
              setIsEditing(true)
              setFeedback({
                message: '✦ Restored your unsaved draft changes from this browser.',
                type: 'info',
              })
            } else if (hasServerContent) {
              // Server has newest verified content
              setReflection(serverRef)
              setFormData({
                whatILearned: serverRef.whatILearned || '',
                whatSurprisedMe: serverRef.whatSurprisedMe || '',
                myOpinion: serverRef.myOpinion || '',
                questionsRemaining: serverRef.questionsRemaining || '',
              })
              setIsEditing(false)
              // Clear stale local draft now that server version is in sync
              try {
                localStorage.removeItem(draftStorageKey)
              } catch (_) {}
            } else {
              setReflection(null)
              setIsEditing(false)
            }
            return
          }
        } catch (err) {
          console.warn('Error loading learning session from backend:', err)
        }
      }

      // Guest mode or no server session found yet: check local draft
      if (isMounted) {
        if (localDraft?.fields) {
          const fields = localDraft.fields
          const hasDraftContent = Boolean(
            fields.whatILearned || fields.whatSurprisedMe || fields.myOpinion || fields.questionsRemaining
          )
          if (hasDraftContent) {
            setFormData({
              whatILearned: fields.whatILearned || '',
              whatSurprisedMe: fields.whatSurprisedMe || '',
              myOpinion: fields.myOpinion || '',
              questionsRemaining: fields.questionsRemaining || '',
            })
            setReflection(fields)
          }
        } else {
          setReflection(null)
          setFormData({
            whatILearned: '',
            whatSurprisedMe: '',
            myOpinion: '',
            questionsRemaining: '',
          })
        }
        setIsEditing(false)
      }
    }

    loadSessionAndReflection()

    return () => {
      isMounted = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [topicId, isAuthenticated, draftStorageKey])

  // Debounced draft saving to local browser storage while user types
  const persistDraft = useCallback(
    (fields) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        try {
          const payload = {
            fields,
            savedAt: new Date().toISOString(),
          }
          localStorage.setItem(draftStorageKey, JSON.stringify(payload))
        } catch (_) {}
      }, 500)
    },
    [draftStorageKey]
  )

  const handleInputChange = (field, value) => {
    isDirtyRef.current = true
    setFormData((prev) => {
      const updated = { ...prev, [field]: value }
      persistDraft(updated)
      return updated
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    setFeedback({ message: '', type: '' })

    // If guest, preserve in local storage and request sign in
    if (!isAuthenticated) {
      try {
        const payload = {
          fields: formData,
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(draftStorageKey, JSON.stringify(payload))
        setReflection(formData)
        setIsEditing(false)
        setFeedback({
          message: '✦ Reflection saved locally. Log in to sync permanently to your BrainDetour account.',
          type: 'info',
        })
      } catch (err) {
        setFeedback({ message: 'Unable to save draft.', type: 'error' })
      } finally {
        setIsSaving(false)
      }
      return
    }

    try {
      // 1. Establish or resolve the active learning session for this topic
      let session = currentSession
      if (!session || !session._id) {
        session = await startOrResumeLearningSession(topicId)
        setCurrentSession(session)
      }

      // 2. Persist all four reflection fields to MongoDB
      const updatedSession = await saveSessionReflection(session._id, {
        whatILearned: formData.whatILearned.trim(),
        whatSurprisedMe: formData.whatSurprisedMe.trim(),
        myOpinion: formData.myOpinion.trim(),
        questionsRemaining: formData.questionsRemaining.trim(),
      })

      setCurrentSession(updatedSession)
      setReflection(updatedSession.reflection || formData)
      setIsEditing(false)
      isDirtyRef.current = false

      // Clear local draft now that server confirmed successful write
      try {
        localStorage.removeItem(draftStorageKey)
      } catch (_) {}

      setFeedback({
        message: '✦ Your reflection has been saved permanently to your learning session in the cloud.',
        type: 'success',
      })
    } catch (err) {
      console.error('Reflection save error:', err)
      // Keep draft safely intact in localStorage and display actionable error
      setFeedback({
        message: `${err.message || 'Failed to save reflection to your account.'} Your draft has been preserved in this browser.`,
        type: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendToSpeechPractice = () => {
    const speechOutline = `Topic: ${topicTitle}\n\n1. What I Learned:\n${formData.whatILearned || 'N/A'}\n\n2. Key Surprises & Nuances:\n${formData.whatSurprisedMe || 'N/A'}\n\n3. My Interpretation & Working Thesis:\n${formData.myOpinion || 'N/A'}\n\n4. Open Empirical Questions:\n${formData.questionsRemaining || 'N/A'}`

    navigate('/presentation', {
      state: {
        thesis: speechOutline,
        topicTitle,
        topicId,
      },
    })
  }

  const hasContent = Boolean(
    reflection && (
      reflection.whatILearned ||
      reflection.whatSurprisedMe ||
      reflection.myOpinion ||
      reflection.questionsRemaining
    )
  )

  return (
    <section className="reflection-section" aria-labelledby="reflection-heading">
      <div className="reflection-header">
        <div>
          <span className="reflection-badge">Personal Synthesis</span>
          <h2 id="reflection-heading" className="reflection-title">
            Your Thoughts &amp; Discoveries
          </h2>
          <p className="reflection-subtitle">
            Synthesize what you read into clear hypotheses before sharing or presenting.
          </p>
        </div>

        {hasContent && !isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsEditing(true)
              setFeedback({ message: '', type: '' })
            }}
          >
            ✎ Edit Reflection
          </Button>
        )}
      </div>

      {feedback.message && (
        <div className={`reflection-feedback-banner reflection-feedback-banner--${feedback.type}`} role="status">
          {feedback.message}
        </div>
      )}

      {/* Case 1: Empty state (no reflection yet & not currently editing) */}
      {!hasContent && !isEditing && (
        <div className="reflection-empty-card">
          <div className="reflection-empty-icon" aria-hidden="true">💡</div>
          <h3 className="reflection-empty-title">No personal reflections recorded yet</h3>
          <p className="reflection-empty-desc">
            Reading primary sources is only the first step. Record your personal takeaways, critiques, and questions to crystallize your thoughts.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsEditing(true)}
          >
            ✦ Record Your Thoughts
          </Button>
        </div>
      )}

      {/* Case 2: Editing Form */}
      {isEditing && (
        <form onSubmit={handleSave} className="reflection-form-card">
          <div className="reflection-field-group">
            <label htmlFor="ref-learned" className="reflection-label">
              1. What I learned
              <span className="reflection-hint">Key empirical findings, theoretical frameworks, or definitions</span>
            </label>
            <textarea
              id="ref-learned"
              className="reflection-textarea"
              rows={3}
              value={formData.whatILearned}
              onChange={(e) => handleInputChange('whatILearned', e.target.value)}
              placeholder="The primary mechanism explained in this literature was..."
            />
          </div>

          <div className="reflection-field-group">
            <label htmlFor="ref-surprised" className="reflection-label">
              2. What surprised me
              <span className="reflection-hint">Counter-intuitive facts, common misconceptions, or edge cases</span>
            </label>
            <textarea
              id="ref-surprised"
              className="reflection-textarea"
              rows={3}
              value={formData.whatSurprisedMe}
              onChange={(e) => handleInputChange('whatSurprisedMe', e.target.value)}
              placeholder="I did not expect that previous research found..."
            />
          </div>

          <div className="reflection-field-group">
            <label htmlFor="ref-opinion" className="reflection-label">
              3. My opinion or interpretation
              <span className="reflection-hint">Your reasoned perspective, working hypothesis, or critique</span>
            </label>
            <textarea
              id="ref-opinion"
              className="reflection-textarea"
              rows={3}
              value={formData.myOpinion}
              onChange={(e) => handleInputChange('myOpinion', e.target.value)}
              placeholder="In my view, the evidence suggests that..."
            />
          </div>

          <div className="reflection-field-group">
            <label htmlFor="ref-questions" className="reflection-label">
              4. Questions I still have
              <span className="reflection-hint">Unresolved doubts, future test ideas, or follow-up inquiries</span>
            </label>
            <textarea
              id="ref-questions"
              className="reflection-textarea"
              rows={3}
              value={formData.questionsRemaining}
              onChange={(e) => handleInputChange('questionsRemaining', e.target.value)}
              placeholder="What additional empirical data would be needed to verify..."
            />
          </div>

          <div className="reflection-form-footer">
            <span className="reflection-storage-notice">
              {isAuthenticated
                ? '🔒 Saved to your BrainDetour account and secured in cloud storage.'
                : '🔒 Working in guest mode. Log in to save reflections permanently to your cloud account.'}
            </span>

            <div className="reflection-actions">
              {hasContent && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false)
                    setFeedback({ message: '', type: '' })
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save Reflection'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Case 3: Read-only Reflection Summary */}
      {hasContent && !isEditing && (
        <div className="reflection-summary-card">
          <div className="reflection-summary-grid">
            <div className="reflection-summary-item">
              <h4>1. What I learned</h4>
              <p>{reflection.whatILearned || '—'}</p>
            </div>
            <div className="reflection-summary-item">
              <h4>2. What surprised me</h4>
              <p>{reflection.whatSurprisedMe || '—'}</p>
            </div>
            <div className="reflection-summary-item">
              <h4>3. My opinion or interpretation</h4>
              <p>{reflection.myOpinion || '—'}</p>
            </div>
            <div className="reflection-summary-item">
              <h4>4. Questions I still have</h4>
              <p>{reflection.questionsRemaining || '—'}</p>
            </div>
          </div>

          <div className="reflection-summary-footer">
            <span className="reflection-storage-badge">
              ✓ Synchronized with cloud learning session
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendToSpeechPractice}
            >
              Transfer to Speech Lab →
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
