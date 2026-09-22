import { useEffect, useRef, useState } from 'react'

const THROTTLE_MS = 100 // <=10Hz

/**
 * Re-renders from engine events, throttled to <=10Hz -- never per frame.
 */
const EMPTY_SUMMARY = { score: 0, lives: 0, pelletsRemaining: 0, status: 'ready' }

export function HUD({ engineRef }) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    const engine = engineRef.current
    setSummary(engine.getRenderState())
    const unsubscribe = engine.subscribe((event) => {
      const now = performance.now()
      const isUrgent = event.type === 'statusChanged' || event.type === 'lifeLost'
      if (!isUrgent && now - lastUpdateRef.current < THROTTLE_MS) return
      lastUpdateRef.current = now
      setSummary(engine.getRenderState())
    })
    return unsubscribe
  }, [engineRef])

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
      <Stat label="Score" value={summary.score} />
      <Stat label="Lives" value={'●'.repeat(Math.max(summary.lives, 0)) || '0'} />
      <Stat label="Pellets" value={summary.pelletsRemaining} />
      <Stat label="Status" value={summary.status} />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[0.7rem] uppercase tracking-[0.08em] text-text-dim">{label}</span>
      <span className="font-mono text-text">{value}</span>
    </div>
  )
}
