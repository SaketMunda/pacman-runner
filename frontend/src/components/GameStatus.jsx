import { useEffect, useRef, useState } from 'react'

const ANNOUNCE_EVERY_MS = 5000

function describe(state) {
  const who = state.controlMode === 'jev' ? 'Jev' : 'Human'
  const d = state.lastDecision
  const decision = d ? ` Last decision ${d.move}, by ${d.source}.` : ''
  return `${who} control, ${state.status}. Score ${state.score}, ${state.lives} lives.${decision}`
}

/**
 * Politely-live text mirror of the canvas: score, lives and the current
 * decision. Throttled to one update per ANNOUNCE_EVERY_MS during play --
 * decisions land several times a second and announcing each would drown a
 * screen reader. Status changes and lost lives announce immediately.
 */
export function GameStatus({ engineRef }) {
  const [text, setText] = useState('')
  const lastRef = useRef(0)

  useEffect(() => {
    const engine = engineRef.current
    setText(describe(engine.state))
    return engine.subscribe((event) => {
      const urgent =
        event.type === 'statusChanged' ||
        event.type === 'lifeLost' ||
        event.type === 'reset' ||
        event.type === 'controlModeChanged'
      if (!urgent && event.type !== 'decision') return
      const now = performance.now()
      if (!urgent && now - lastRef.current < ANNOUNCE_EVERY_MS) return
      lastRef.current = now
      setText(describe(engine.state))
    })
  }, [engineRef])

  return (
    <p id="game-status" role="status" aria-live="polite" className="sr-only-live">
      {text}
    </p>
  )
}
