import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { InteractiveMicrophone } from '../features/presentation/InteractiveMicrophone'
import { TIMER_DURATION_OPTIONS, WHEEL_CATEGORIES } from '../lib/constants'
import {
  fetchRandomSpeechTopic,
  fetchActiveTopics,
  createSpeechSession,
  completeSpeechSession,
  pollSpeechSessionUntilComplete,
  getSpeechSession,
  getSpeechHistory,
  retrySpeechAnalysis,
} from '../services/speechApiService'
import '../features/presentation/SpeechLab.css'
import './Pages.css'

/**
 * Safely extracts the user's authentic first name for the speech coach greeting.
 * Discards emails, appended username digits, and system placeholders.
 * Returns null if name is unavailable (triggering clean "Hello!" greeting).
 * 
 * @param {Object|null} user
 * @returns {string|null}
 */
export function extractFirstName(user) {
  if (!user) return null
  if (user.firstName && typeof user.firstName === 'string') {
    const clean = user.firstName.trim().replace(/\d+$/g, '')
    if (clean && !clean.includes('@') && clean.length >= 2) {
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
    }
  }

  const raw = user.name || user.fullName
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('@')) return null
  if (/^\d+$/.test(trimmed)) return null

  // Take the first name component
  let first = trimmed.split(/\s+/)[0]
  // Strip trailing numbers (e.g. Niveditasingh925 -> Niveditasingh)
  first = first.replace(/\d+$/g, '')
  // If concatenated with common surnames (e.g. Niveditasingh)
  const match = first.match(/^([A-Z][a-z]{2,})(singh|kumar|sharma|verma|gupta|patel|das|roy)$/i)
  if (match) {
    first = match[1]
  }

  if (!first || first.length < 2) return null
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

/**
 * Format raw Gemini or server error into a friendly, helpful user notification.
 */
function formatAnalysisErrorMessage(errorStr, hasSavedSession) {
  if (!errorStr) return ''
  const str = String(errorStr)

  // Check for 503 / high demand / unavailable
  const is503 =
    str.includes('503') ||
    str.toLowerCase().includes('high demand') ||
    str.toLowerCase().includes('temporarily') ||
    str.includes('UNAVAILABLE')

  // Check for 429 / resource exhausted / rate limit
  const is429 =
    str.includes('429') ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.toLowerCase().includes('rate limit') ||
    str.toLowerCase().includes('quota')

  if (is503) {
    return hasSavedSession
      ? 'Gemini is temporarily busy. Your presentation has been saved. Please retry in a moment.'
      : 'Gemini is temporarily busy. Please retry in a moment.'
  }

  if (is429) {
    return hasSavedSession
      ? 'Gemini request limit reached. Your presentation has been saved. Please wait a moment and retry.'
      : 'Gemini request limit reached. Please wait a moment and retry.'
  }

  // Remove any raw JSON wrapping like {"error":...}
  try {
    const jsonMatch = str.match(/\{[\s\S]*"error"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed?.error?.message) {
        if (parsed.error.code === 503 || parsed.error.status === 'UNAVAILABLE') {
          return hasSavedSession
            ? 'Gemini is temporarily busy. Your presentation has been saved. Please retry in a moment.'
            : 'Gemini is temporarily busy. Please retry in a moment.'
        }
        return `Gemini notice: ${parsed.error.message}`
      }
    }
  } catch (_) {}

  // Clean any sensitive key tokens
  return str
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]')
    .replace(/AQ\.[0-9A-Za-z-_]+/g, '[REDACTED]')
}

export function PresentationPage() {
  usePageTitle('Speech Lab — Interactive Topic Wheel & AI Speaking Coach')
  const location = useLocation()
  const navigate = useNavigate()
  const reviewRef = useRef(null)

  // Stages: 'setup' | 'topic' | 'speaking' | 'processing' | 'feedback'
  const [stage, setStage] = useState(() =>
    location.state?.topic || location.state?.topicTitle ? 'topic' : 'setup'
  )

  // User identity and coach greeting (retrieves authentic first name, safe fallback if absent)
  const { user } = useAuth()
  const firstName = extractFirstName(user)
  const greetingTitle = firstName ? `Hello, ${firstName}!` : 'Hello!'
  const greetingInstruction =
    "I'm your speech coach for today. When you're ready, start speaking about your selected topic. I'll listen to your presentation and provide detailed feedback to help you improve."

  // Genre selection state
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [duration, setDuration] = useState(5) // 5, 10, or 15 minutes

  // Interactive Roulette Wheel animation state
  const [isSpinning, setIsSpinning] = useState(false)
  const [isLanded, setIsLanded] = useState(false)
  const [isRouletteMuted, setIsRouletteMuted] = useState(() => {
    try {
      return localStorage.getItem('braindetour_roulette_muted') === 'true'
    } catch {
      return false
    }
  })
  const isRouletteMutedRef = useRef(isRouletteMuted)
  const [spinError, setSpinError] = useState(null)
  const [reelItems, setReelItems] = useState([])
  const [reelOffset, setReelOffset] = useState(57)
  const [reelTransition, setReelTransition] = useState('none')

  // Selected topic state - always preserves authentic topic identifier without fabrication
  const [topic, setTopic] = useState(() => {
    if (location.state?.topic) return location.state.topic
    if (location.state?.topicTitle) {
      const explicitId = location.state.topicId || location.state.topic?._id || location.state.topic?.id || null
      return {
        _id: explicitId,
        id: explicitId,
        title: location.state.topicTitle,
        category: location.state.topicCategory || 'Curious',
        description: location.state.topicDescription || '',
      }
    }
    return null
  })

  // Audio Recording & Capture State
  const [permissionStatus, setPermissionStatus] = useState('prompt') // 'prompt' | 'granted' | 'denied' | 'unsupported'
  const [permissionError, setPermissionError] = useState(null)
  const [isStartingRecording, setIsStartingRecording] = useState(false)
  const [isStoppingRecording, setIsStoppingRecording] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(5 * 60)
  const [actualDurationSeconds, setActualDurationSeconds] = useState(0)
  const [stream, setStream] = useState(null)
  const [currentSessionId, setCurrentSessionId] = useState(null)

  // AI Speech Coach Voice State & Lifecycle
  const [isCoachSpeaking, setIsCoachSpeaking] = useState(false)
  const isCoachSpeakingRef = useRef(false)
  const coachUtteranceRef = useRef(null)
  const greetingTimeoutRef = useRef(null)
  const hasSpokenGreetingRef = useRef(false)
  const isLiveRecordingStartedRef = useRef(false)
  const prevSearchRef = useRef(location.search)

  // AI Analysis & Feedback State
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState('')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  const [showFullTranscript, setShowFullTranscript] = useState(false)

  // Past Sessions History Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historySessions, setHistorySessions] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)

  // Refs for media recording and interval timing
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const startTimeRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const streamRef = useRef(null)
  const isStoppingRef = useRef(false)
  const isStartingRef = useRef(false)
  const isSpinningRef = useRef(false)
  const isReelMovingRef = useRef(false)
  const spinSequenceRef = useRef(0)
  const spinDelayRef = useRef(null)
  const rouletteAudioContextRef = useRef(null)
  const rouletteSpinSoundRef = useRef(null)
  const rouletteSelectionSoundRef = useRef(null)

  const waitForSpinDelay = (durationMs) => new Promise((resolve) => {
    const delay = {
      timeoutId: setTimeout(() => {
        if (spinDelayRef.current === delay) {
          spinDelayRef.current = null
        }
        resolve(true)
      }, durationMs),
      resolve,
    }
    spinDelayRef.current = delay
  })

  const cancelSpinDelay = () => {
    const delay = spinDelayRef.current
    if (!delay) return
    clearTimeout(delay.timeoutId)
    spinDelayRef.current = null
    delay.resolve(false)
  }

  const getRouletteAudioContext = () => {
    if (rouletteAudioContextRef.current && rouletteAudioContextRef.current.state !== 'closed') {
      return rouletteAudioContextRef.current
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    rouletteAudioContextRef.current = new AudioContextClass()
    return rouletteAudioContextRef.current
  }

  const startRouletteSpinSound = (muted = isRouletteMutedRef.current) => {
    if (muted || rouletteSpinSoundRef.current) return
    try {
      const context = getRouletteAudioContext()
      if (!context) return
      context.resume().catch(() => {})
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const startAt = context.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(220, startAt)
      oscillator.frequency.exponentialRampToValueAtTime(145, startAt + 3.2)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.008, startAt + 0.12)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startAt)
      rouletteSpinSoundRef.current = { oscillator, gain }
    } catch (error) {
      console.warn('Roulette spin sound unavailable:', error)
    }
  }

  const stopRouletteSpinSound = () => {
    const sound = rouletteSpinSoundRef.current
    if (!sound) return
    rouletteSpinSoundRef.current = null
    try {
      const stopAt = sound.gain.context.currentTime
      sound.gain.gain.cancelScheduledValues(stopAt)
      sound.gain.gain.setTargetAtTime(0.0001, stopAt, 0.015)
      sound.oscillator.stop(stopAt + 0.06)
    } catch {}
  }

  const playRouletteSelectionSound = () => {
    if (isRouletteMutedRef.current) return
    try {
      const context = getRouletteAudioContext()
      if (!context) return
      context.resume().catch(() => {})
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const startAt = context.currentTime + 0.08
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(520, startAt)
      oscillator.frequency.exponentialRampToValueAtTime(780, startAt + 0.09)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.linearRampToValueAtTime(0.035, startAt + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        if (rouletteSelectionSoundRef.current === oscillator) {
          rouletteSelectionSoundRef.current = null
        }
        context.suspend().catch(() => {})
      }
      rouletteSelectionSoundRef.current = oscillator
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.25)
    } catch (error) {
      console.warn('Roulette selection sound unavailable:', error)
    }
  }

  const stopRouletteAudio = () => {
    stopRouletteSpinSound()
    const selectionSound = rouletteSelectionSoundRef.current
    rouletteSelectionSoundRef.current = null
    if (selectionSound) {
      try {
        selectionSound.stop()
      } catch {}
    }
    const context = rouletteAudioContextRef.current
    rouletteAudioContextRef.current = null
    if (context && context.state !== 'closed') {
      context.close().catch(() => {})
    }
  }

  const handleToggleRouletteSound = () => {
    const nextMuted = !isRouletteMuted
    isRouletteMutedRef.current = nextMuted
    setIsRouletteMuted(nextMuted)
    try {
      localStorage.setItem('braindetour_roulette_muted', String(nextMuted))
    } catch {}
    if (nextMuted) {
      stopRouletteAudio()
    } else if (isReelMovingRef.current) {
      startRouletteSpinSound(nextMuted)
    }
  }

  // Keep streamRef updated
  useEffect(() => {
    streamRef.current = stream
  }, [stream])

  // Sync remaining seconds when duration setting changes while idle
  useEffect(() => {
    if (!isRecording && stage === 'setup') {
      setSecondsRemaining(duration * 60)
    }
  }, [duration, isRecording, stage])

  // Pre-fetch and cache speech synthesis voices across browser engines
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const handleVoicesChanged = () => {
        try {
          window.speechSynthesis.getVoices()
        } catch {}
      }
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel()
        } catch {}
      }
      if (greetingTimeoutRef.current) {
        clearTimeout(greetingTimeoutRef.current)
        greetingTimeoutRef.current = null
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      cancelSpinDelay()
      stopRouletteAudio()
      isSpinningRef.current = false
      isReelMovingRef.current = false
      spinSequenceRef.current += 1
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  // Handle safe back navigation from the speech recording screen
  const isNavigatingBackRef = useRef(false)

  const handleSafeBackFromRecording = useCallback(() => {
    if (isNavigatingBackRef.current) return
    isNavigatingBackRef.current = true

    // Cancel active AI coach speech synthesis and intro timeout
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = null
    }
    isCoachSpeakingRef.current = false
    setIsCoachSpeaking(false)
    hasSpokenGreetingRef.current = false
    isLiveRecordingStartedRef.current = false

    // 1. Safely stop timer interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    // 2. Safely stop and release physical microphone tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setStream(null)

    // 3. Stop media recorder without submitting audio for analysis
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      try {
        mediaRecorderRef.current.stop()
      } catch (_) {}
    }
    audioChunksRef.current = []

    // 4. Reset recording state cleanly
    setIsRecording(false)
    setIsStartingRecording(false)
    setIsStoppingRecording(false)
    isStartingRef.current = false
    isStoppingRef.current = false
    setSecondsRemaining(duration * 60)
    setActualDurationSeconds(0)

    // 5. Safely return to topic ready stage (or setup), preserving topic and duration
    setStage(topic ? 'topic' : 'setup')

    setTimeout(() => {
      isNavigatingBackRef.current = false
    }, 150)
  }, [duration, topic])

  // Detect when user navigates back (via browser Back button or popstate) while recording
  useEffect(() => {
    const prevSearch = prevSearchRef.current
    prevSearchRef.current = location.search

    const prevParams = new URLSearchParams(prevSearch)
    const currentParams = new URLSearchParams(location.search)

    const hadSpeakingParam = prevParams.get('stage') === 'speaking'
    const hasSpeakingParam = currentParams.get('stage') === 'speaking'

    // Only trigger back navigation if we WERE in speaking URL and user navigated away from it
    if (stage === 'speaking' && hadSpeakingParam && !hasSpeakingParam) {
      handleSafeBackFromRecording()
    }
  }, [location.search, stage, handleSafeBackFromRecording])

  const handleInInterfaceBack = () => {
    handleSafeBackFromRecording()
    const params = new URLSearchParams(location.search)
    if (params.get('stage') === 'speaking') {
      navigate(-1)
    }
  }

  const handleBackToSpeechLab = () => {
    setPermissionError(null)
    setStage('setup')
    navigate(location.pathname, {
      replace: true,
      state: {
        ...location.state,
        topic,
        duration,
      },
    })
  }

  // Select Genre Pill
  const handleSelectGenre = (genre) => {
    setSelectedGenre(genre)
    setSpinError(null)
  }

  /**
   * Interactive Random Topic Wheel Interaction
   * Assembles a candidate reel track from real active backend topics,
   * fetches the real random topic from backend API,
   * animates vertical deceleration in a viewport overlay, and locks onto the real chosen topic.
   */
  const handleSpinWheel = async () => {
    if (isSpinningRef.current || isStartingRef.current) return
    isSpinningRef.current = true
    isReelMovingRef.current = false
    const spinSequence = ++spinSequenceRef.current
    setIsSpinning(true)
    setIsLanded(false)
    setSpinError(null)
    setAnalysisResult(null)
    setAnalysisError(null)
    setSessionData(null)

    setReelItems([])
    setReelOffset(57) // Center the first 56px reel row in the 170px aperture
    setReelTransition('none')
    if (!isRouletteMutedRef.current && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      try {
        getRouletteAudioContext()?.resume().catch(() => {})
      } catch (error) {
        console.warn('Roulette audio is unavailable:', error)
      }
    }

    try {
      const categoryParam = selectedGenre === 'All' ? null : selectedGenre
      const [activeTopics, targetTopic] = await Promise.all([
        fetchActiveTopics(categoryParam),
        fetchRandomSpeechTopic(categoryParam),
      ])
      if (spinSequence !== spinSequenceRef.current) return
      if (!targetTopic || !targetTopic.title) {
        throw new Error('No topic received from server')
      }

      const targetTitle = targetTopic.title.trim()
      const eligibleTitles = [...new Set(activeTopics.map((item) => item.title?.trim()).filter(Boolean))]
      const hasReelVariety = eligibleTitles.length > 1
      const targetIdx = hasReelVariety ? 11 : 0
      let reel = [targetTitle]

      if (hasReelVariety) {
        reel = []
        const otherTitles = eligibleTitles.filter((title) => title !== targetTitle)

        if (eligibleTitles.length === 2) {
          const alternateTitles = [otherTitles[0], targetTitle]
          reel = Array.from({ length: targetIdx }, (_, index) => alternateTitles[index % 2])
        } else {
          for (let index = 0; index < targetIdx; index += 1) {
            const previousTitle = reel[reel.length - 1]
            let candidates = eligibleTitles.filter((title) => title !== previousTitle)
            if (index === targetIdx - 1) {
              candidates = candidates.filter((title) => title !== targetTitle)
            }
            reel.push(candidates[Math.floor(Math.random() * candidates.length)])
          }
        }

        reel.push(targetTitle)
      }

      setReelItems(reel)
      if (!(await waitForSpinDelay(50))) return
      if (spinSequence !== spinSequenceRef.current) return

      const targetOffset = 57 - targetIdx * 56
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const spinDuration = !hasReelVariety || reducedMotion ? 0 : 3200
      setReelTransition(spinDuration ? `transform ${spinDuration}ms cubic-bezier(0.12, 0.72, 0.2, 1)` : 'none')
      if (spinDuration) {
        isReelMovingRef.current = true
        startRouletteSpinSound()
      }
      setReelOffset(targetOffset)

      if (spinDuration && !(await waitForSpinDelay(spinDuration + 80))) return
      if (spinSequence !== spinSequenceRef.current) return

      isReelMovingRef.current = false
      stopRouletteSpinSound()
      setIsLanded(true)
      playRouletteSelectionSound()
      setTopic(targetTopic)
      if (!(await waitForSpinDelay(1200))) return
      if (spinSequence !== spinSequenceRef.current) return

      setStage('topic')
      setIsSpinning(false)
      isSpinningRef.current = false
      setReelTransition('none')
      setIsLanded(false)
    } catch (err) {
      if (spinSequence !== spinSequenceRef.current) return
      cancelSpinDelay()
      stopRouletteAudio()
      isReelMovingRef.current = false
      console.error('Topic selection failed:', err)
      setSpinError('Could not retrieve random topic. Please check your connection and try again.')
      setIsSpinning(false)
      isSpinningRef.current = false
      setIsLanded(false)
      setReelTransition('none')
    }
  }

  /**
   * Safe helper to detect supported audio MIME type for browser MediaRecorder
   */
  const getSupportedAudioMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav',
    ]
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t
      }
    }
    return ''
  }

  /**
   * Helper to pick a natural sounding English speech synthesis voice if available in the browser.
   */
  const getPreferredVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null
    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) return null

    // Prefer high-quality English natural voices
    const preferred = voices.find(
      (v) =>
        v.lang &&
        v.lang.toLowerCase().startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Karen') ||
          v.name.includes('Daniel') ||
          v.name.includes('Aaron') ||
          v.name.includes('Zira'))
    )
    if (preferred) return preferred

    const englishVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
    if (englishVoice) return englishVoice

    return voices[0] || null
  }

  /**
   * Starts live audio recording slice collection and countdown timer once coach greeting ends.
   */
  const startLiveRecording = (
    sessId = currentSessionId,
    recorder = mediaRecorderRef.current,
    audioStream = streamRef.current
  ) => {
    if (isLiveRecordingStartedRef.current) return
    if (!recorder || isStoppingRef.current || isNavigatingBackRef.current) return

    isLiveRecordingStartedRef.current = true
    setIsCoachSpeaking(false)
    isCoachSpeakingRef.current = false

    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = null
    }

    try {
      if (recorder.state === 'inactive') {
        recorder.start(1000) // Collect in 1s slices
      }
      setIsRecording(true)

      const totalSeconds = duration * 60
      setSecondsRemaining(totalSeconds)
      setActualDurationSeconds(0)
      startTimeRef.current = Date.now()

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      timerIntervalRef.current = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000)
        const left = Math.max(0, totalSeconds - elapsedSec)
        setSecondsRemaining(left)
        setActualDurationSeconds(elapsedSec)

        // Automatically stop capture when duration expires
        if (left <= 0) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
          handleStopCapture(sessId, elapsedSec, recorder, audioStream)
        }
      }, 500)
    } catch (err) {
      console.error('Failed to start microphone recording:', err)
      setPermissionError('Failed to capture audio from your microphone. Please try again.')
    }
  }

  /**
   * Speaks the AI Coach Greeting aloud using window.speechSynthesis.
   * Begins live microphone capture and timer immediately when the greeting finishes.
   */
  const speakCoachGreeting = (sessId, recorder, audioStream) => {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      // Speech synthesis unsupported: smoothly start recording without voice intro
      startLiveRecording(sessId, recorder, audioStream)
      return
    }

    try {
      window.speechSynthesis.cancel()
    } catch {}

    hasSpokenGreetingRef.current = true

    const textToSpeak = `${greetingTitle} ${greetingInstruction}`
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    coachUtteranceRef.current = utterance

    const voice = getPreferredVoice()
    if (voice) {
      utterance.voice = voice
    }
    utterance.rate = 1.0
    utterance.pitch = 1.0

    let finished = false
    const onFinish = () => {
      if (finished) return
      finished = true
      if (greetingTimeoutRef.current) {
        clearTimeout(greetingTimeoutRef.current)
        greetingTimeoutRef.current = null
      }
      startLiveRecording(sessId, recorder, audioStream)
    }

    utterance.onstart = () => {
      setIsCoachSpeaking(true)
      isCoachSpeakingRef.current = true
    }

    utterance.onend = () => {
      onFinish()
    }

    utterance.onerror = (event) => {
      console.warn('Speech synthesis utterance encountered notice/error:', event)
      onFinish()
    }

    // Safety fallback: if speech synthesis is blocked, stalled, or takes longer than 12s
    greetingTimeoutRef.current = setTimeout(() => {
      onFinish()
    }, 12000)

    try {
      setIsCoachSpeaking(true)
      isCoachSpeakingRef.current = true
      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('Speech synthesis speak call failed:', err)
      onFinish()
    }
  }

  const handleSkipGreeting = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = null
    }
    setIsCoachSpeaking(false)
    isCoachSpeakingRef.current = false
    startLiveRecording(currentSessionId, mediaRecorderRef.current, streamRef.current)
  }

  const handleReplayGreeting = () => {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return
    }

    try {
      window.speechSynthesis.cancel()
      const textToSpeak = `${greetingTitle} ${greetingInstruction}`
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      coachUtteranceRef.current = utterance

      const voice = getPreferredVoice()
      if (voice) utterance.voice = voice
      utterance.rate = 1.0
      utterance.pitch = 1.0

      utterance.onstart = () => {
        setIsCoachSpeaking(true)
        isCoachSpeakingRef.current = true
      }
      utterance.onend = () => {
        setIsCoachSpeaking(false)
        isCoachSpeakingRef.current = false
      }
      utterance.onerror = () => {
        setIsCoachSpeaking(false)
        isCoachSpeakingRef.current = false
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('Manual speech replay failed:', err)
      setIsCoachSpeaking(false)
      isCoachSpeakingRef.current = false
    }
  }

  /**
   * Starts microphone capture with explicit user permission and enters Stage 2.
   */
  const handleStartRecording = async () => {
    if (isStartingRef.current || isRecording || isLiveRecordingStartedRef.current) return
    isStartingRef.current = true
    setIsStartingRecording(true)
    setPermissionError(null)
    setAnalysisError(null)
    setAnalysisResult(null)
    setSessionData(null)
    isLiveRecordingStartedRef.current = false

    let audioStream = null
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setPermissionStatus('unsupported')
        throw new Error('Microphone recording is not supported in this browser.')
      }

      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      setStream(audioStream)
      streamRef.current = audioStream
      setPermissionStatus('granted')

      const mimeType = getSupportedAudioMimeType()
      const recorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream)

      // Explicitly extract and validate the topic identifier before sending request
      const rawTopicId = topic?._id || topic?.id || (typeof topic === 'string' ? topic : null)
      if (!rawTopicId || typeof rawTopicId !== 'string' || !rawTopicId.trim()) {
        throw new Error('Please select a valid topic before starting your speech practice.')
      }
      const topicId = rawTopicId.trim()

      const session = await createSpeechSession({
        topicId,
        durationMinutes: duration,
      })
      const sessId = session.id || session._id
      setCurrentSessionId(sessId)

      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current = recorder
      isStoppingRef.current = false

      // Advance immediately to Stage 2: Live Speaking Screen with browser history entry
      setStage('speaking')
      navigate(`${location.pathname}?stage=speaking`, {
        replace: false,
        state: {
          ...location.state,
          topic,
          duration,
        },
      })

      // Set initial duration countdown display (stays full until coach finishes greeting)
      const totalSeconds = duration * 60
      setSecondsRemaining(totalSeconds)
      setActualDurationSeconds(0)

      // Speak coach greeting aloud; live recording & timer begin after greeting ends
      speakCoachGreeting(sessId, recorder, audioStream)
    } catch (err) {
      console.error('Session initiation failed:', err)
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop())
      }
      setStream(null)
      streamRef.current = null
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionStatus('denied')
        setPermissionError('Microphone permission was denied. Allow microphone access in your browser settings, then try again.')
      } else {
        setPermissionError(`Failed to start speech session: ${err.message}`)
      }
    } finally {
      isStartingRef.current = false
      setIsStartingRecording(false)
    }
  }

  /**
   * Stops microphone recording, releases hardware tracks, and advances to Stage 3 Processing.
   */
  const handleStopCapture = (
    sessionId = currentSessionId,
    elapsedSec = actualDurationSeconds,
    recorder = mediaRecorderRef.current,
    audioStream = stream
  ) => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    setIsStoppingRecording(true)

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = null
    }
    setIsCoachSpeaking(false)
    isCoachSpeakingRef.current = false

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    setIsRecording(false)
    setStage('processing')

    const params = new URLSearchParams(location.search)
    if (params.get('stage') === 'speaking') {
      navigate(location.pathname, { replace: true, state: location.state })
    }

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        // Release physical microphone tracks immediately
        if (audioStream) {
          audioStream.getTracks().forEach((track) => track.stop())
        }
        setStream(null)

        const mimeType = recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })

        if (audioBlob.size < 500 && elapsedSec < 3) {
          setPermissionError('Recording was stopped too quickly or no audio was captured. Please speak clearly into your microphone and try again.')
          setIsStoppingRecording(false)
          isStoppingRef.current = false
          setStage('topic')
          return
        }

        await submitCaptureForAnalysis(sessionId, audioBlob, elapsedSec)
      }
      recorder.stop()
    } else {
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop())
      }
      setStream(null)
      setIsStoppingRecording(false)
      isStoppingRef.current = false
    }
  }

  /**
   * Uploads recorded audio blob to backend, initiates Gemini analysis, and polls until completion.
   */
  const submitCaptureForAnalysis = async (sessionId, audioBlob, elapsedSec) => {
    if (!sessionId) {
      setIsStoppingRecording(false)
      isStoppingRef.current = false
      return
    }
    setIsAnalyzing(true)
    setAnalysisError(null)
    setStage('processing')
    setAnalysisProgress('Uploading audio recording to secure server…')

    try {
      await completeSpeechSession({
        sessionId,
        audioBlob,
        actualDurationSeconds: elapsedSec,
      })

      setAnalysisProgress('Gemini AI is transcribing speech and evaluating your reasoning…')

      const completedSession = await pollSpeechSessionUntilComplete(
        sessionId,
        (progressSession) => {
          if (progressSession) {
            setSessionData(progressSession)
          }
          if (progressSession.status === 'processing') {
            setAnalysisProgress('Evaluating argument progression, empirical claims, and missing concepts…')
          }
        }
      )

      if (completedSession.status === 'failed') {
        setSessionData(completedSession)
        throw new Error(completedSession.failureReason || 'Gemini speech analysis failed.')
      }

      setSessionData(completedSession)
      setAnalysisResult(completedSession.analysis)
      setStage('feedback')

      setTimeout(() => {
        reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    } catch (err) {
      console.error('Analysis submission failed:', err)
      setAnalysisError(err.message || 'Failed to complete speech analysis.')
    } finally {
      setIsAnalyzing(false)
      setIsStoppingRecording(false)
      isStoppingRef.current = false
    }
  }

  /**
   * Retry failed analysis safely using preserved session audio on backend.
   */
  const handleRetryFailedAnalysis = async () => {
    const sessId = sessionData?.id || sessionData?._id || currentSessionId
    if (!sessId) return
    setIsAnalyzing(true)
    setAnalysisError(null)
    setStage('processing')
    setAnalysisProgress('Retrying Gemini evaluation with safe backoff…')

    try {
      const retryResult = await retrySpeechAnalysis(sessId)
      if (retryResult?.status === 'completed') {
        setSessionData(retryResult)
        setAnalysisResult(retryResult.analysis)
        setStage('feedback')
        setIsAnalyzing(false)
        return
      }

      const completedSession = await pollSpeechSessionUntilComplete(
        sessId,
        (progressSession) => {
          if (progressSession) {
            setSessionData(progressSession)
          }
          if (progressSession.status === 'processing') {
            setAnalysisProgress('Evaluating argument progression, empirical claims, and missing concepts…')
          }
        }
      )

      if (completedSession.status === 'failed') {
        setSessionData(completedSession)
        throw new Error(completedSession.failureReason || 'Gemini retry failed.')
      }

      setSessionData(completedSession)
      setAnalysisResult(completedSession.analysis)
      setStage('feedback')
      setTimeout(() => {
        reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    } catch (err) {
      setAnalysisError(err.message || 'Analysis retry failed.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  /**
   * Loads past session history from backend.
   */
  const handleOpenHistoryModal = async () => {
    setShowHistoryModal(true)
    setLoadingHistory(true)
    try {
      const data = await getSpeechHistory(historyPage, 10)
      setHistorySessions(data.sessions || [])
      setHistoryTotalPages(data.pagination?.totalPages || 1)
    } catch (err) {
      console.warn('Could not fetch history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  /**
   * Loads a specific past session into view and enters Stage 4 Feedback.
   */
  const handleSelectPastSession = async (sessId) => {
    try {
      const sess = await getSpeechSession(sessId)
      setSessionData(sess)
      setAnalysisResult(sess.analysis)
      if (sess.topic) setTopic(sess.topic)
      setShowHistoryModal(false)
      setStage('feedback')
      setTimeout(() => {
        reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      console.error('Failed to load past session:', err)
    }
  }

  /**
   * Resets workflow back to Stage 1 to pick a new challenge.
   */
  const handleStartNewChallenge = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = null
    }
    hasSpokenGreetingRef.current = false
    isLiveRecordingStartedRef.current = false
    setIsCoachSpeaking(false)
    setAnalysisResult(null)
    setAnalysisError(null)
    setSessionData(null)
    setCurrentSessionId(null)
    setActualDurationSeconds(0)
    setSecondsRemaining(duration * 60)
    setTopic(null)
    setStage('setup')
    if (location.search) {
      navigate(location.pathname, { replace: true })
    }
  }

  /**
   * Re-practices the currently selected challenge.
   */
  const handleRepracticeTopic = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = null
    }
    hasSpokenGreetingRef.current = false
    isLiveRecordingStartedRef.current = false
    setIsCoachSpeaking(false)
    setAnalysisResult(null)
    setAnalysisError(null)
    setSessionData(null)
    setCurrentSessionId(null)
    setActualDurationSeconds(0)
    setSecondsRemaining(duration * 60)
    setStage('setup')
    if (location.search) {
      navigate(location.pathname, { replace: true })
    }
  }

  // Formatting minutes and seconds for countdown display
  const minutesDisplay = Math.floor(secondsRemaining / 60)
  const secondsDisplay = secondsRemaining % 60
  const formattedCountdown = `${minutesDisplay < 10 ? '0' : ''}${minutesDisplay}:${
    secondsDisplay < 10 ? '0' : ''
  }${secondsDisplay}`

  // Extract stronger version and structure note from Gemini analysis
  const strongerRewrite =
    typeof analysisResult?.strongerAnswer === 'object'
      ? analysisResult.strongerAnswer?.exampleRewrite || analysisResult.strongerAnswer?.structure || ''
      : typeof analysisResult?.strongerAnswer === 'string'
      ? analysisResult.strongerAnswer
      : ''

  const strongerStructure =
    typeof analysisResult?.strongerAnswer === 'object'
      ? analysisResult.strongerAnswer?.structure || ''
      : ''

  return (
    <div className={`presentation-page speech-lab-page ${stage === 'speaking' ? 'speech-lab-page--recording' : ''} ${stage === 'topic' ? 'speech-lab-page--topic' : ''}`}>
      {/* =========================================================================
          STAGE 1 & SPEECH-READY: Minimal Eyebrow, Topic Roulette & Speech-Ready View
          ========================================================================= */}
      {stage === 'setup' && (
        <section className="speech-discovery-panel" aria-label="Topic Discovery &amp; Speech Lab">
          {isSpinning && (
            <div className="speech-roulette-overlay" role="dialog" aria-modal="true" aria-label="Topic Selection Roulette">
              <div className="speech-roulette-modal">
                <div className="speech-roulette-controls">
                  <button
                    type="button"
                    className="speech-roulette-sound-btn"
                    onClick={handleToggleRouletteSound}
                    aria-label={isRouletteMuted ? 'Unmute roulette sounds' : 'Mute roulette sounds'}
                    aria-pressed={isRouletteMuted}
                    title={isRouletteMuted ? 'Unmute roulette sounds' : 'Mute roulette sounds'}
                  >
                    {isRouletteMuted ? '🔇' : '🔊'}
                  </button>
                  <button
                    type="button"
                    className="speech-roulette-close-btn"
                    onClick={() => {
                      spinSequenceRef.current += 1
                      cancelSpinDelay()
                      stopRouletteAudio()
                      isSpinningRef.current = false
                      isReelMovingRef.current = false
                      setIsSpinning(false)
                      setIsLanded(false)
                      setReelTransition('none')
                    }}
                    aria-label="Close topic roulette"
                    title="Close topic roulette"
                  >
                    ✕
                  </button>
                </div>

                <div className="speech-roulette-modal-header">
                  <span className="speech-roulette-genre-badge">
                    Genre: {selectedGenre}
                  </span>
                  <div className="speech-roulette-spinning-indicator">
                    <span className="speech-spin-pulse-dot" />
                    <span>{isLanded ? 'Topic Selected!' : 'Selecting your detour inquiry…'}</span>
                  </div>
                </div>

                <div className="speech-roulette-aperture">
                  <div className={`speech-roulette-focus-box ${isLanded ? 'speech-roulette-focus-box--winner' : ''}`} />
                  <div
                    className="speech-roulette-track"
                    style={{
                      transform: `translateY(${reelOffset}px)`,
                      transition: reelTransition,
                    }}
                  >
                    {reelItems.map((item, idx) => (
                      <div
                        key={idx}
                        className={`speech-roulette-item ${
                          isLanded && idx === reelItems.length - 1 ? 'speech-roulette-item--winner' : ''
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="speech-hero-header">
            <div className="speech-eyebrow-pill">
              <span>✦ Infinite curiosity, infinite discovery ✦</span>
            </div>
            <h1 className="speech-hero-title">Spin the wheel, discover your topic.</h1>
          </div>

          <div className="speech-genre-list" role="radiogroup" aria-label="Select Category Genre">
            {['All', ...WHEEL_CATEGORIES].map((genre) => (
              <button
                key={genre}
                type="button"
                className={`speech-genre-pill ${selectedGenre === genre ? 'speech-genre-pill--active' : ''}`}
                onClick={() => handleSelectGenre(genre)}
                disabled={isSpinning}
              >
                {genre}
              </button>
            ))}
          </div>

          <div className="speech-mode-row" role="radiogroup" aria-label="Target Speaking Duration">
            {TIMER_DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`speech-mode-pill ${duration === opt.value ? 'speech-mode-pill--active' : ''}`}
                onClick={() => setDuration(opt.value)}
                disabled={isSpinning}
              >
                ⏱ {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="speech-wheel-btn"
            onClick={handleSpinWheel}
            disabled={isSpinning}
            id="spin-topic-wheel-btn"
          >
            {isSpinning ? (
              <>
                <span className="speech-spin-pulse-dot" />
                <span>Spinning Topic Wheel…</span>
              </>
            ) : (
              <>
                <span>🎲</span>
                <span>Random Topic Wheel →</span>
              </>
            )}
          </button>

          {spinError && (
            <div className="speech-permission-alert speech-permission-alert--error" role="alert">
              <span>⚠️</span>
              <span>{spinError}</span>
              <button type="button" className="speech-typed-toggle-link" onClick={handleSpinWheel}>
                Retry
              </button>
            </div>
          )}
        </section>
      )}

      {stage === 'topic' && topic && (
        <div className="speech-topic-container">
          <div className="speech-coach-nav-bar speech-topic-nav-bar">
            <button
              type="button"
              className="speech-coach-back-btn"
              onClick={handleBackToSpeechLab}
              id="speech-topic-back-btn"
              aria-label="Back to Speech Lab"
            >
              <span className="speech-coach-back-arrow" aria-hidden="true">←</span>
              <span>Back to Speech Lab</span>
            </button>
          </div>

          <section className="speech-topic-card" aria-label="Selected topic">
            <h1 className="speech-topic-card__title">{topic.title}</h1>
            {topic.description && <p className="speech-topic-card__description">{topic.description}</p>}
            <Button
              variant="primary"
              size="lg"
              onClick={handleStartRecording}
              disabled={isStartingRecording}
              className="speech-topic-card__start"
              id="start-speech-btn"
            >
              {isStartingRecording ? 'Preparing microphone…' : 'Start Speech'}
            </Button>
          </section>
          {permissionError && <p className="speech-topic-error" role="alert">{permissionError}</p>}
        </div>
      )}

      {/* =========================================================================
          STAGE 2: Dedicated Live Speech Coach Screen
          ========================================================================= */}
      {stage === 'speaking' && (
        <section className="speech-coach-screen" role="region" aria-label="Live Speech Coach Stage">
          <div className="speech-coach-nav-bar">
            <button
              type="button"
              className="speech-coach-back-btn"
              onClick={handleInInterfaceBack}
              id="speech-recording-back-btn"
              aria-label="Back to topic selection"
            >
              <span className="speech-coach-back-arrow" aria-hidden="true">←</span>
              <span>Back to Topic</span>
            </button>
          </div>

          <div className="speech-coach-greeting-block">
            <h2 className="speech-coach-name-title">{greetingTitle}</h2>
            {topic?.title && (
              <p className="speech-coach-topic-tag" title={topic.title}>
                {topic.title}
              </p>
            )}
          </div>

          <InteractiveMicrophone stream={stream} isRecording={isRecording} />

          <div className="speech-coach-timer-card">
            <div className="speech-coach-clock-digits" aria-live="polite">
              {formattedCountdown}
            </div>
          </div>

          <div className={`speech-recording-live-pill ${isCoachSpeaking ? 'speech-recording-live-pill--coach' : ''}`}>
            {isCoachSpeaking ? (
              <>
                <span className="speech-coach-voice-wave-dot" aria-hidden="true" />
                <span>Coach is introducing your session…</span>
              </>
            ) : (
              <>
                <span className="speech-live-red-dot" aria-hidden="true" />
                <span>Recording in progress</span>
              </>
            )}
          </div>

          <div className="speech-live-actions">
            <Button
              variant="primary"
              size="lg"
              onClick={() => handleStopCapture()}
              disabled={isStoppingRecording}
              id="stop-get-feedback-btn"
              className="speech-stop-feedback-btn"
            >
              {isStoppingRecording ? (
                <>
                  <span className="speech-spin-pulse-dot" aria-hidden="true" />
                  <span>Finalizing speech…</span>
                </>
              ) : (
                'Stop & Get Feedback'
              )}
            </Button>
          </div>
        </section>
      )}
      {/* =========================================================================
          STAGE 3: Processing Screen with Real Status Steps
          ========================================================================= */}
      {stage === 'processing' && (
        <section className="speech-coach-processing" role="status" aria-live="polite">
          <div className="speech-processing-glow-orb" />
          <h2 className="speech-processing-title">Your speech is in.</h2>
          <p className="speech-processing-sub">{analysisProgress || 'Your speech coach is preparing your feedback.'}</p>

          <div className="speech-processing-checklist">
            <div className="speech-processing-status-item speech-processing-status-item--done">
              <span>✓</span>
              <span>Audio recording captured securely</span>
            </div>
            <div className={`speech-processing-status-item ${analysisResult ? 'speech-processing-status-item--done' : 'speech-processing-status-item--active'}`}>
              <span>{analysisResult ? '✓' : '●'}</span>
              <span>Transcribing speech with Gemini AI</span>
            </div>
            <div className="speech-processing-status-item speech-processing-status-item--active">
              <span>●</span>
              <span>Evaluating reasoning, evidence &amp; generating stronger version</span>
            </div>
          </div>

          {analysisError && (
            <div
              className="speech-permission-alert speech-permission-alert--error"
              style={{ marginTop: 'var(--space-6)', textAlign: 'left' }}
              role="alert"
            >
              <div style={{ flex: 1 }}>
                <strong>Notice:</strong> {formatAnalysisErrorMessage(analysisError, true)}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryFailedAnalysis}
                  disabled={isAnalyzing}
                  id="retry-analysis-btn"
                >
                  {isAnalyzing ? 'Retrying…' : '🔄 Retry Analysis'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartNewChallenge}
                >
                  Start Over
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          STAGE 4: Borderless Feedback Report with Two-Column Comparison
          ========================================================================= */}
      {stage === 'feedback' && analysisResult && (
        <section ref={reviewRef} className="speech-feedback-report" aria-label="Personalised Speaking Report">
          {/* Header Block directly on background */}
          <div className="speech-report-header">
            <div className="speech-report-head-top">
              <span className="speech-report-tag">✦ YOUR SPEAKING REPORT ✦</span>
              {analysisResult?.scores?.overall && (
                <div className="speech-score-bubble">
                  <span>Overall Score:</span>
                  <span className="speech-score-big-num">{analysisResult.scores.overall.score}/5</span>
                </div>
              )}
            </div>

            <h2 className="speech-report-topic-title">{topic?.title || 'Oral Rehearsal'}</h2>

            <div className="speech-report-meta-row">
              <span>🏷 {topic?.category || selectedGenre || 'Curious'}</span>
              <span>•</span>
              <span>⏱ {sessionData?.durationMinutes || duration} min target ({sessionData?.actualDurationSeconds || actualDurationSeconds}s spoke)</span>
              <span>•</span>
              <span>📅 {sessionData?.completedAt ? new Date(sessionData.completedAt).toLocaleDateString() : 'Today'}</span>
            </div>

            {analysisResult?.executiveSummary && (
              <div className="speech-report-exec-highlight">
                <strong>Executive Summary:</strong> {analysisResult.executiveSummary}
              </div>
            )}
          </div>

          {/* MAIN COMPARISON: 2 BALANCED COLUMNS (Desktop) / STACKED (Mobile) */}
          <div className="speech-compare-wrapper">
            <div className="speech-compare-heading-center">
              <h3 className="speech-compare-title">Oral Response Comparison</h3>
              <p className="speech-compare-desc">
                Compare your verbatim spoken reasoning on the left with an elevated, better-structured answer on the right.
              </p>
            </div>

            <div className="speech-compare-grid">
              {/* LEFT COLUMN: WHAT YOU SAID */}
              <div className="speech-compare-col speech-compare-col--user">
                <div className="speech-compare-col-bar">
                  <span className="speech-compare-col-name">
                    <span>🎙</span>
                    <span>WHAT YOU SAID</span>
                  </span>
                  <span className="speech-compare-pill-tag">Verbatim Audio</span>
                </div>

                <div className="speech-compare-col-content">
                  <p className="speech-compare-text-body">
                    {sessionData?.transcript || 'Transcript captured during rehearsal.'}
                  </p>

                  {analysisResult?.whatUserSaid?.length > 0 && (
                    <div style={{ marginTop: 'auto', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-subtle)' }}>
                      <strong style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-deep)', display: 'block', marginBottom: '6px' }}>
                        Key Points Extracted:
                      </strong>
                      <ul className="speech-bullets-list" style={{ margin: 0, paddingLeft: '18px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        {analysisResult.whatUserSaid.map((point, idx) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: A STRONGER VERSION */}
              <div className="speech-compare-col speech-compare-col--stronger">
                <div className="speech-compare-col-bar">
                  <span className="speech-compare-col-name">
                    <span>✨</span>
                    <span>A STRONGER VERSION</span>
                  </span>
                  <span className="speech-compare-pill-tag">Coach Elevated</span>
                </div>

                <div className="speech-compare-col-content">
                  <p className="speech-compare-text-body">
                    {strongerRewrite || 'A structured rewrite calibrated to address the core inquiry with enhanced evidence and logic.'}
                  </p>

                  {strongerStructure && (
                    <div className="speech-structure-blueprint-note">
                      <strong>Recommended Architecture:</strong> {strongerStructure}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* DETAILED FEEDBACK EDITORIAL SECTIONS UNDERNEATH (No heavy card boxes) */}
          <div className="speech-feedback-editorial">
            {/* Epistemic Evaluation Rubric Breakdown */}
            {analysisResult?.scores && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title">
                  <span>📊</span>
                  <span>Epistemic Evaluation Rubric</span>
                </div>
                <div className="speech-scores-grid">
                  {Object.entries(analysisResult.scores)
                    .filter(([k]) => k !== 'overall')
                    .map(([key, item]) => (
                      <div key={key} className="speech-score-card">
                        <div className="speech-score-title">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="speech-score-number">{item.score}</div>
                        <span className="speech-score-scale">out of 5</span>
                        {item.explanation && (
                          <div className="speech-score-desc">{item.explanation}</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Strengths / What You Did Well */}
            {analysisResult?.strengths?.length > 0 && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title speech-feed-section-title--green">
                  <span>✓</span>
                  <span>What You Did Well</span>
                </div>
                <ul className="speech-bullets-list speech-strengths-list">
                  {analysisResult.strengths.map((str, idx) => (
                    <li key={idx}>{str}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing Concepts */}
            {analysisResult?.missingConcepts?.length > 0 && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title speech-feed-section-title--orange">
                  <span>✦</span>
                  <span>Missing Concepts</span>
                </div>
                <div className="speech-missing-grid">
                  {analysisResult.missingConcepts.map((item, idx) => (
                    <div key={idx} className="speech-missing-item">
                      <div className="speech-missing-item__concept">{item.concept}</div>
                      <div className="speech-missing-item__relevance">{item.relevance}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accuracy & Evidence Verification */}
            {analysisResult?.accuracyAndEvidence?.length > 0 && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title">
                  <span>⚖️</span>
                  <span>Accuracy &amp; Evidence Verification</span>
                </div>
                <div className="speech-accuracy-list">
                  {analysisResult.accuracyAndEvidence.map((claim, idx) => (
                    <div key={idx} className="speech-claim-item">
                      <div className="speech-claim-item__header">
                        <span className="speech-claim-text">"{claim.claim}"</span>
                        <span className={`speech-claim-pill speech-claim-pill--${claim.category || 'unverified'}`}>
                          {claim.category?.replace('_', ' ') || 'claim evaluation'}
                        </span>
                      </div>
                      <div className="speech-claim-assessment">{claim.assessment}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structure & Reasoning */}
            {analysisResult?.reasoningAndStructure && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title">
                  <span>🏛</span>
                  <span>Structure &amp; Reasoning Breakdown</span>
                </div>
                <div className="speech-structure-grid">
                  {Object.entries(analysisResult.reasoningAndStructure).map(([key, val]) => (
                    <div key={key} className="speech-structure-item">
                      <div className="speech-structure-item__title">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </div>
                      <p className="speech-structure-item__desc">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clarity of Expression */}
            {analysisResult?.clarityOfExpression && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title">
                  <span>💬</span>
                  <span>Clarity of Expression</span>
                </div>
                <p className="speech-section-text">{analysisResult.clarityOfExpression}</p>
              </div>
            )}

            {/* Action Plan */}
            {analysisResult?.actionPlan?.length > 0 && (
              <div className="speech-feed-section">
                <div className="speech-feed-section-title">
                  <span>🎯</span>
                  <span>Concrete Action Plan for Next Session</span>
                </div>
                <div className="speech-action-steps-row">
                  {analysisResult.actionPlan.map((action, idx) => (
                    <div key={idx} className="speech-step-bubble">
                      <span className="speech-step-number">{idx + 1}</span>
                      <p className="speech-step-text">{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expandable Verbatim Transcript Accordion */}
            {sessionData?.transcript && (
              <div className="speech-full-transcript-box">
                <button
                  type="button"
                  className="speech-full-transcript-btn"
                  onClick={() => setShowFullTranscript((p) => !p)}
                  aria-expanded={showFullTranscript}
                >
                  <span>📜 Full Verbatim Audio Transcript ({sessionData.transcript.split(/\s+/).length} words)</span>
                  <span>{showFullTranscript ? '▲ Hide' : '▼ Expand'}</span>
                </button>
                {showFullTranscript && (
                  <div className="speech-full-transcript-body">
                    {sessionData.transcript}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="speech-report-nav-bar">
            <Button
              variant="primary"
              size="md"
              onClick={handleStartNewChallenge}
            >
              🎙 Start New Practice Challenge
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={handleRepracticeTopic}
            >
              🔄 Re-practice This Topic
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={handleOpenHistoryModal}
            >
              📜 View Past History
            </Button>
          </div>
        </section>
      )}

      {/* =========================================================================
          PAST SESSIONS MODAL
          ========================================================================= */}
      {showHistoryModal && (
        <div className="speech-history-overlay" onClick={() => setShowHistoryModal(false)}>
          <div
            className="speech-history-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
          >
            <div className="speech-history-header">
              <h3 id="history-modal-title" style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-text-main)' }}>
                📜 Your Speech Lab History
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowHistoryModal(false)}>
                ✕ Close
              </Button>
            </div>

            <div className="speech-history-content">
              {loadingHistory ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '24px' }}>
                  Loading previous speaking sessions…
                </p>
              ) : historySessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <p style={{ color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                    No completed speech lab rehearsals yet.
                  </p>
                  <Button variant="primary" size="sm" onClick={() => setShowHistoryModal(false)}>
                    Start Your First Speech
                  </Button>
                </div>
              ) : (
                historySessions.map((item) => (
                  <div
                    key={item._id}
                    className="speech-history-item"
                    onClick={() => handleSelectPastSession(item._id)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleSelectPastSession(item._id)
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', color: 'var(--color-text-main)' }}>
                        {item.topic?.title || 'Speech Practice'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                        {new Date(item.createdAt).toLocaleDateString()} • {item.durationMinutes} min • Status: {item.status}
                      </div>
                    </div>
                    {item.analysis?.scores?.overall && (
                      <span className="speech-pill speech-pill--category">
                        {item.analysis.scores.overall.score}/5
                      </span>
                    )}
                  </div>
                ))
              )}

              {historyTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage <= 1}
                    onClick={() => {
                      setHistoryPage((p) => Math.max(1, p - 1))
                      handleOpenHistoryModal()
                    }}
                  >
                    Previous
                  </Button>
                  <span style={{ fontSize: 'var(--font-size-xs)', alignSelf: 'center', color: 'var(--color-text-secondary)' }}>
                    Page {historyPage} of {historyTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= historyTotalPages}
                    onClick={() => {
                      setHistoryPage((p) => Math.min(historyTotalPages, p + 1))
                      handleOpenHistoryModal()
                    }}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
