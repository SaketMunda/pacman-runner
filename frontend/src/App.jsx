import { ControlBar } from './components/ControlBar.jsx'
import { GameCanvas } from './components/GameCanvas.jsx'
import { HUD } from './components/HUD.jsx'
import { useGameEngine } from './hooks/useGameEngine.js'

function JevPanelPlaceholder() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <span className="text-[0.7rem] uppercase tracking-[0.08em] text-text-dim">
        Jev telemetry
      </span>
      <p className="text-sm text-text-dim">
        Decision, probabilities, aggression and the decision log land here in Phase 4.
      </p>
    </div>
  )
}

function App() {
  const engineRef = useGameEngine()

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-lg font-medium tracking-tight text-text">Jev Pac-Runner</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_22rem]">
        <GameCanvas engineRef={engineRef} />
        <JevPanelPlaceholder />
      </div>
      <HUD engineRef={engineRef} />
      <ControlBar engineRef={engineRef} />
    </div>
  )
}

export default App
