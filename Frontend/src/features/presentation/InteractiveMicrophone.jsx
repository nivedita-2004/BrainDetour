import { useEffect, useRef, useState } from 'react'

/**
 * Interactive Purpose-Built Microphone Component for Speech Lab
 * 
 * Visual features:
 * - Handcrafted SVG studio condenser microphone silhouette sitting directly on page background
 * - No cropped images, square containers, or enclosing cards
 * - 3 concentric audio-reactive animated rings responding to live audio amplitude
 * - Soft radial breathing glow using theme tokens
 * - Dynamic waveform frequency bars via Web Audio API AnalyserNode
 * - Smooth idle (ready to speak) and active (recording / speaking / quiet) states
 * - Fully adapted for both Light Mode and Dark Mode
 * - Automatic resource cleanup (AudioContext, tracks, animation frames)
 * 
 * @param {{
 *   stream: MediaStream | null,
 *   isRecording: boolean,
 *   isStopped?: boolean
 * }} props
 */
export function InteractiveMicrophone({ stream, isRecording, isStopped = false }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const audioContextRef = useRef(null)
  const [hasVoiceActivity, setHasVoiceActivity] = useState(false)

  useEffect(() => {
    if (!isRecording || !stream || isStopped) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      if (containerRef.current) {
        containerRef.current.style.setProperty('--mic-amp', '0')
        containerRef.current.style.setProperty('--mic-halo-scale', '1')
      }
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    let audioCtx = null
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      audioCtx = new AudioContextClass()
      audioContextRef.current = audioCtx
    } catch (err) {
      console.warn('Web Audio API not supported for audio visualizer:', err)
      return
    }

    // Connect MediaStreamSource -> AnalyserNode
    // DO NOT connect to audioCtx.destination to prevent speaker feedback loop
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.78
    const bufferLength = analyser.frequencyBinCount
    const freqData = new Uint8Array(bufferLength)
    const timeData = new Uint8Array(bufferLength)

    let source = null
    try {
      source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      audioCtx.resume().catch(() => {})
    } catch (err) {
      console.warn('Failed to connect media stream source:', err)
      if (audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {})
      }
      return
    }

    let smoothedAmp = 0
    const canvas = canvasRef.current
    const ctx = canvas ? canvas.getContext('2d') : null

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render)

      analyser.getByteFrequencyData(freqData)
      analyser.getByteTimeDomainData(timeData)

      // Calculate RMS amplitude from time domain
      let sumSquares = 0
      for (let i = 0; i < bufferLength; i++) {
        const norm = (timeData[i] - 128) / 128
        sumSquares += norm * norm
      }
      const rms = Math.sqrt(sumSquares / bufferLength)

      // Noise gate: ignore room silence below 0.03
      const rawAmp = rms < 0.03 ? 0 : Math.min(1, (rms - 0.03) * 3.8)
      smoothedAmp = smoothedAmp * 0.65 + rawAmp * 0.35

      const isSpeaking = smoothedAmp > 0.07
      setHasVoiceActivity((previous) => previous === isSpeaking ? previous : isSpeaking)

      // Update CSS variables on container for 60fps GPU-accelerated styling
      if (containerRef.current) {
        const ampVal = smoothedAmp.toFixed(3)
        const scaleVal = (1 + smoothedAmp * 0.15).toFixed(3)
        containerRef.current.style.setProperty('--mic-amp', ampVal)
        containerRef.current.style.setProperty('--mic-halo-scale', scaleVal)
      }

      // Render audio-reactive frequency bars on canvas
      if (ctx && canvas) {
        const width = canvas.width
        const height = canvas.height
        ctx.clearRect(0, 0, width, height)

        const barCount = 28
        const step = Math.floor(bufferLength / barCount) || 1
        const barWidth = 4
        const gap = (width - barCount * barWidth) / (barCount - 1)

        // Gradient for waveform bars adapts to theme
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
        const grad = ctx.createLinearGradient(0, 0, width, 0)
        if (isDark) {
          grad.addColorStop(0, '#A785DC')
          grad.addColorStop(0.5, '#C084FC')
          grad.addColorStop(1, '#818CF8')
        } else {
          grad.addColorStop(0, '#9270C8')
          grad.addColorStop(0.5, '#A855F7')
          grad.addColorStop(1, '#7253A8')
        }

        for (let i = 0; i < barCount; i++) {
          const binIndex = i * step
          const val = freqData[binIndex] || 0
          const barHeight = isSpeaking
            ? Math.max(3, (val / 255) * (height * 0.85))
            : 3
          const x = i * (barWidth + gap)
          const y = (height - barHeight) / 2

          ctx.fillStyle = grad
          ctx.beginPath()
          const radius = barWidth / 2
          ctx.roundRect(x, y, barWidth, barHeight, radius)
          ctx.fill()
        }
      }
    }

    render()

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
      if (source) {
        source.disconnect()
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {})
      }
    }
  }, [stream, isRecording, isStopped])

  const stateClass = isStopped
    ? 'speech-mic--stopped'
    : isRecording
    ? (hasVoiceActivity ? 'speech-mic--speaking' : 'speech-mic--quiet')
    : 'speech-mic--idle'

  return (
    <div
      ref={containerRef}
      className={`speech-mic-stage ${stateClass}`}
      aria-label="Interactive Speaking Microphone"
    >
      <div className="speech-mic-circle-anchor">
        {/* Soft circular halo glow behind the microphone */}
        <div className="speech-mic-halo" />

        {/* Concentric audio-reactive animated ripple rings */}
        <div className="speech-mic-ring speech-mic-ring--1" />
        <div className="speech-mic-ring speech-mic-ring--2" />
        <div className="speech-mic-ring speech-mic-ring--3" />

        {/* Center UI Microphone silhouette component — no cropped images */}
        <div className="speech-mic-capsule-wrap">
          <svg
            className="speech-mic-svg"
            viewBox="0 0 96 128"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              {/* Grille gradient */}
              <linearGradient id="micGrilleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--mic-grille-stop1, #B392E8)" />
                <stop offset="50%" stopColor="var(--mic-grille-stop2, #9270C8)" />
                <stop offset="100%" stopColor="var(--mic-grille-stop3, #6E4BA8)" />
              </linearGradient>

              {/* Body cylinder gradient */}
              <linearGradient id="micBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--mic-body-edge, #5B3B96)" />
                <stop offset="35%" stopColor="var(--mic-body-mid, #855EB8)" />
                <stop offset="65%" stopColor="var(--mic-body-light, #A078DC)" />
                <stop offset="100%" stopColor="var(--mic-body-edge, #5B3B96)" />
              </linearGradient>

              {/* Stand / metal hardware gradient */}
              <linearGradient id="micHardwareGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--mic-hardware-stop1, #D8C4EF)" />
                <stop offset="100%" stopColor="var(--mic-hardware-stop2, #7253A8)" />
              </linearGradient>

              {/* Subtle inner highlight */}
              <linearGradient id="micHighlightGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Shock Mount Cradle Arc */}
            <path
              d="M16 46 C16 78 80 78 80 46"
              stroke="url(#micHardwareGrad)"
              strokeWidth="4"
              strokeLinecap="round"
              className="speech-mic-hardware-arc"
            />
            {/* Cradle swivel screws */}
            <circle cx="16" cy="46" r="3.5" fill="url(#micHardwareGrad)" />
            <circle cx="80" cy="46" r="3.5" fill="url(#micHardwareGrad)" />

            {/* Stand Stem */}
            <line
              x1="48"
              y1="69"
              x2="48"
              y2="104"
              stroke="url(#micHardwareGrad)"
              strokeWidth="5"
              strokeLinecap="round"
            />

            {/* Stand Base / Foot */}
            <ellipse
              cx="48"
              cy="108"
              rx="26"
              ry="7"
              fill="url(#micHardwareGrad)"
              className="speech-mic-base-foot"
            />
            <ellipse
              cx="48"
              cy="106"
              rx="22"
              ry="5"
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity="0.25"
              strokeWidth="1"
            />

            {/* Microphone Lower Body */}
            <rect
              x="30"
              y="54"
              width="36"
              height="20"
              rx="6"
              fill="url(#micBodyGrad)"
              className="speech-mic-lower-body"
            />

            {/* Collar Band / Joint */}
            <rect
              x="28"
              y="50"
              width="40"
              height="5"
              rx="2.5"
              fill="url(#micHardwareGrad)"
            />

            {/* Microphone Grille Capsule */}
            <rect
              x="30"
              y="10"
              width="36"
              height="42"
              rx="18"
              fill="url(#micGrilleGrad)"
              className="speech-mic-grille-capsule"
            />

            {/* Grille mesh horizontal texture lines */}
            <line x1="33" y1="20" x2="63" y2="20" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="32" y1="26" x2="64" y2="26" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="31" y1="32" x2="65" y2="32" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="32" y1="38" x2="64" y2="38" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="33" y1="44" x2="63" y2="44" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round" />

            {/* Grille vertical center mesh rib */}
            <line x1="48" y1="12" x2="48" y2="50" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />

            {/* Top dome highlight gloss */}
            <path
              d="M34 18 C38 13 58 13 62 18"
              stroke="url(#micHighlightGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Indicator light pip on body */}
            <circle
              cx="48"
              cy="62"
              r="2"
              className="speech-mic-indicator-pip"
            />
          </svg>
        </div>
      </div>

      {/* Live frequency waveform bars directly integrated beneath microphone */}
      <div className="speech-mic-waveform-slot">
        <canvas
          ref={canvasRef}
          width={320}
          height={48}
          className="speech-mic-waveform-canvas"
          role="img"
          aria-label="Real-time speech input activity waveform"
        />
      </div>
    </div>
  )
}
