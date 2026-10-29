import { useEffect, useRef } from 'react'

/**
 * Real-time Audio Waveform visualizer using Web Audio API and HTML5 Canvas.
 * Renders an animated frequency/amplitude visualizer while microphone capture is active.
 * 
 * @param {{
 *   stream: MediaStream | null,
 *   isRecording: boolean
 * }} props
 */
export function AudioWaveform({ stream, isRecording }) {
  const canvasRef = useRef(null)
  const animationFrameRef = useRef(null)
  const audioContextRef = useRef(null)

  useEffect(() => {
    if (!isRecording || !stream) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      // Clear canvas
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
      }
      return
    }

    let audioCtx = null
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext
      audioCtx = new AudioCtxClass()
      audioContextRef.current = audioCtx
    } catch (e) {
      console.warn('Web Audio API not supported on this browser:', e)
      return
    }

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw)

      analyser.getByteFrequencyData(dataArray)

      // Responsive dimensions
      const width = canvas.width
      const height = canvas.height

      ctx.clearRect(0, 0, width, height)

      // Background subtle gradient
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, '#9270C8')
      gradient.addColorStop(0.5, '#F2B8C8')
      gradient.addColorStop(1, '#A9D4C4')

      const barWidth = (width / bufferLength) * 2.2
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = Math.max(3, (dataArray[i] / 255) * height * 0.85)

        ctx.fillStyle = gradient
        // Draw rounded vertical bars centered vertically
        const y = (height - barHeight) / 2
        ctx.fillRect(x, y, Math.max(2, barWidth - 2), barHeight)

        x += barWidth
      }
    }

    draw()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {})
      }
    }
  }, [stream, isRecording])

  return (
    <div className="audio-waveform-container" aria-label="Microphone Audio Activity Visualizer">
      <canvas
        ref={canvasRef}
        width={360}
        height={60}
        className="audio-waveform-canvas"
        role="img"
        aria-label="Real-time audio waveform activity"
      />
    </div>
  )
}
