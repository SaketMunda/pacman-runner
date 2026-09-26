import { useEffect, useRef, useState } from 'react'
import { createDecisionScheduler } from '../ai/decisionScheduler.js'
import { useGameEngine } from './useGameEngine.js'

const THROTTLE_MS = 100 // <=10Hz
const DECISION_LOG_SIZE = 8
const BACKEND_DOWN_STREAK_FOR_BANNER = 3

const EMPTY_PANEL_STATE = {
  currentDecision: null,
  decisionLog: [],
  stats: { requests: 0, hits: 0, hitRate: 0, medianLatencyMs: null, fallbacks: {}, bySource: {} },
  controlMode: 'human',
  status: 'ready',
}

/**
 * Creates the decision scheduler once and hands it to useGameEngine as the
 * decisionProvider, then bridges its events into throttled panel state.
 * `onTick` runs at TICK_HZ via the engine's own 'tick' event -- the
 * scheduler never runs its own loop.
 */
export function useJevDecisions() {
  const [scheduler] = useState(() => createDecisionScheduler())
  const engineRef = useGameEngine({ decisionProvider: scheduler })

  const [panelState, setPanelState] = useState(EMPTY_PANEL_STATE)
  const [backendDownStreak, setBackendDownStreak] = useState(0)
  // Bumped each time a request succeeds after one or more backend-down
  // fallbacks, so the health-driven mode indicator knows to re-fetch.
  const [backendRecoveries, setBackendRecoveries] = useState(0)

  const decisionLogRef = useRef([])
  const lastPublishRef = useRef(0)

  useEffect(() => {
    const engine = engineRef.current
    const streakRef = { current: 0 }

    function publish(force) {
      const now = performance.now()
      if (!force && now - lastPublishRef.current < THROTTLE_MS) return
      lastPublishRef.current = now
      setPanelState({
        currentDecision: engine.state.lastDecision,
        decisionLog: decisionLogRef.current,
        stats: scheduler.getStats(),
        controlMode: engine.state.controlMode,
        status: engine.state.status,
      })
    }

    const unsubscribe = engine.subscribe((event) => {
      if (event.type === 'tick') {
        scheduler.onTick(engine.state)
        return
      }

      if (event.type === 'decision') {
        const { decision, junctionId } = event
        decisionLogRef.current = [
          {
            junctionId,
            move: decision.move,
            source: decision.source,
            latencyMs: decision.latencyMs ?? null,
            reason: decision.reason ?? null,
            at: Date.now(),
          },
          ...decisionLogRef.current,
        ].slice(0, DECISION_LOG_SIZE)

        if (decision.reason === 'backend-down') {
          streakRef.current += 1
        } else if (decision.source !== 'fallback') {
          if (streakRef.current > 0) setBackendRecoveries((n) => n + 1)
          streakRef.current = 0
        }
        setBackendDownStreak(streakRef.current)
        publish(true)
        return
      }

      if (event.type === 'reset' || event.type === 'lifeLost') {
        scheduler.reset()
        publish(true)
        return
      }

      if (event.type === 'controlModeChanged' || event.type === 'statusChanged') {
        publish(true)
      }
    })
    publish(true)

    return unsubscribe
  }, [engineRef, scheduler])

  return {
    engineRef,
    panelState,
    backendDown: backendDownStreak >= BACKEND_DOWN_STREAK_FOR_BANNER,
    backendRecoveries,
  }
}
