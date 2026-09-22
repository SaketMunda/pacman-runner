import { useEffect, useState } from 'react'

export function ControlBar({ engineRef, toggleRef }) {
  const [status, setStatus] = useState('ready')
  const [controlMode, setControlModeState] = useState('human')

  useEffect(() => {
    const engine = engineRef.current
    setStatus(engine.state.status)
    setControlModeState(engine.state.controlMode)
    return engine.subscribe((event) => {
      if (event.type === 'statusChanged') setStatus(event.status)
      if (event.type === 'controlModeChanged') setControlModeState(event.mode)
    })
  }, [engineRef])

  const engine = engineRef.current

  function toggleControlMode() {
    engine.setControlMode(controlMode === 'human' ? 'jev' : 'human')
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <button
        type="button"
        className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-jev"
        onClick={() => engine.start()}
      >
        {status === 'ready' || status === 'paused' ? 'Start' : 'Playing'}
      </button>
      <button
        type="button"
        className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-jev"
        onClick={() => engine.pause()}
      >
        Pause
      </button>
      <button
        type="button"
        className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-jev"
        onClick={() => engine.reset()}
      >
        Restart
      </button>
      <label className="ml-auto flex items-center gap-2 text-sm text-text-dim">
        <span>Human</span>
        <button
          ref={toggleRef}
          type="button"
          role="switch"
          aria-checked={controlMode === 'jev'}
          onClick={toggleControlMode}
          className="relative h-6 w-11 rounded-full border border-border bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-jev"
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-jev transition-transform duration-200 ${
              controlMode === 'jev' ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-jev">Jev</span>
      </label>
    </div>
  )
}
