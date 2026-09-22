import { useEffect, useRef } from 'react'
import { createEngine } from '../game/loop.js'

const KEY_TO_DIRECTION = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
}

/**
 * Owns the engine instance in a ref -- never in React state -- and wires
 * keyboard input. GameCanvas drives the engine's rAF/tick loop; this hook
 * only creates it once and keeps it alive for the component tree's lifetime.
 */
export function useGameEngine({ decisionProvider } = {}) {
  const engineRef = useRef(null)
  if (engineRef.current === null) {
    engineRef.current = createEngine({ decisionProvider })
  }

  useEffect(() => {
    function onKeyDown(event) {
      const direction = KEY_TO_DIRECTION[event.key]
      if (!direction) return
      event.preventDefault()
      const engine = engineRef.current
      if (engine.state.controlMode !== 'human') return
      engine.setQueuedDirection(direction)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return engineRef
}
