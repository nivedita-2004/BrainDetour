import { useState, useEffect } from 'react'
import { TIMER_DURATION_OPTIONS } from '../../lib/constants'
import { Button } from '../../components/ui/Button'
import './PresentationTimer.css'

/**
 * PresentationTimer component provides duration selection, active countdown timer,
 * and controls for presentation rehearsal and AI review preparation.
 */
export function PresentationTimer({ duration = 5, onDurationChange, onTimerComplete }) {
  const [selectedDuration, setSelectedDuration] = useState(duration)
  const [secondsLeft, setSecondsLeft] = useState(duration * 60)
  const [prevDuration, setPrevDuration] = useState(duration)
  const [isRunning, setIsRunning] = useState(false)

  // Sync state during render when prop duration changes (React recommended pattern)
  if (prevDuration !== duration) {
    setPrevDuration(duration)
    setSelectedDuration(duration)
    setSecondsLeft(duration * 60)
    setIsRunning(false)
  }

  // Sync remaining seconds when target duration changes
  const handleDurationChange = (minutes) => {
    setSelectedDuration(minutes)
    setSecondsLeft(minutes * 60)
    setIsRunning(false)
    if (onDurationChange) onDurationChange(minutes)
  }

  // Active rehearsal timer countdown
  useEffect(() => {
    let interval = null
    if (isRunning) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false)
            if (onTimerComplete) onTimerComplete()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRunning, onTimerComplete])

  const minutesDisplay = Math.floor(secondsLeft / 60)
  const secondsDisplay = secondsLeft % 60
  const formattedTime = `${minutesDisplay < 10 ? '0' : ''}${minutesDisplay}:${secondsDisplay < 10 ? '0' : ''}${secondsDisplay}`

  const handleToggle = () => {
    if (secondsLeft === 0) {
      setSecondsLeft(selectedDuration * 60)
    }
    setIsRunning((prev) => !prev)
  }

  const handleReset = () => {
    setIsRunning(false)
    setSecondsLeft(selectedDuration * 60)
  }

  return (
    <div className="presentation-timer">
      <div className="presentation-timer__header">
        <h3 className="presentation-timer__title">Rehearsal Practice Timer</h3>
        <p className="presentation-timer__subtitle">
          Select target presentation length to calibrate pacing against epistemic evaluation benchmarks.
        </p>
      </div>

      <div className="presentation-timer__durations" role="group" aria-label="Target Durations">
        {TIMER_DURATION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`presentation-timer__duration-btn ${
              selectedDuration === opt.value ? 'presentation-timer__duration-btn--active' : ''
            }`}
            onClick={() => handleDurationChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="presentation-timer__display">
        <div className="presentation-timer__clock" aria-live="polite">
          {formattedTime}
        </div>
        <span className="presentation-timer__status">
          {isRunning ? '✦ Rehearsal in Progress ✦' : secondsLeft === 0 ? 'Session Complete' : 'Ready to Begin'}
        </span>
      </div>

      <div className="presentation-timer__actions">
        <Button variant="primary" size="md" onClick={handleToggle}>
          {isRunning ? 'Pause Rehearsal' : secondsLeft === 0 ? 'Restart Rehearsal' : 'Start Practice Rehearsal'}
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={!isRunning && secondsLeft === selectedDuration * 60}
          onClick={handleReset}
        >
          Reset Timer
        </Button>
      </div>
    </div>
  )
}
