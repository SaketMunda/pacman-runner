import { useEffect, useState } from 'react'

const BUTTON_CLASS =
  'rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text hover:border-text-dim'

const FINISHED = new Set(['won', 'gameover'])

/** Label and action for the one primary button, by engine status. */
function primaryAction(status) {
  if (status === 'playing') return { label: 'Pause', run: (engine) => engine.pause() }
  if (status === 'paused') return { label: 'Resume', run: (engine) => engine.start() }
  if (FINISHED.has(status)) return { label: 'Play again', run: restartAndPlay }
  return { label: 'Start', run: (engine) => engine.start() }
}

function restartAndPlay(engine) {
  engine.reset()
  engine.start()
}

export function ControlBar({ engineRef, toggleRef }) {
  const [status, setStatus] = useState('ready')
  const [controlMode, setControlModeState] = useState('human')

  useEffect(() => {
    const engine = engineRef.current
    setStatus(engine.state.status)
    setControlModeState(engine.state.controlMode)
    return engine.subscribe((event) => {
      if (event.type === 'statusChanged') setStatus(event.status)
      if (event.type === 'reset') setStatus(engine.state.status)
      if (event.type === 'controlModeChanged') setControlModeState(event.mode)
    })
  }, [engineRef])

  const engine = engineRef.current
  const primary = primaryAction(status)

  function toggleControlMode() {
    const next = controlMode === 'human' ? 'jev' : 'human'
    engine.setControlMode(next)
    // The engine only ticks while playing, so Jev on a finished board would
    // make no decisions and the panel would sit idle. Start a fresh round
    // instead: flipping to Jev always results in Jev visibly playing.
    if (next === 'jev' && FINISHED.has(engine.state.status)) restartAndPlay(engine)
  }

  const isJev = controlMode === 'jev'

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <button type="button" className={BUTTON_CLASS} onClick={() => primary.run(engine)}>
        {primary.label}
      </button>
      <button type="button" className={BUTTON_CLASS} onClick={() => engine.reset()}>
        Restart
      </button>
      <div className="ml-auto flex items-center gap-2 text-sm">
        <span className={isJev ? 'text-text-dim' : 'text-text'}>
          Human
        </span>
        <button
          ref={toggleRef}
          type="button"
          role="switch"
          aria-checked={isJev}
          aria-label="Jev controls Pac-Runner"
          title={
            FINISHED.has(status) && !isJev
              ? 'Switching to Jev starts a new round'
              : 'Toggle who steers Pac-Runner'
          }
          onClick={toggleControlMode}
          className="relative h-6 w-11 rounded-full border border-border bg-surface-2"
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform duration-200 ${
              isJev ? 'translate-x-5 bg-jev' : 'translate-x-0.5 bg-text-dim'
            }`}
          />
        </button>
        <span className={isJev ? 'text-jev' : 'text-text-dim'}>Jev</span>
      </div>
    </div>
  )
}
