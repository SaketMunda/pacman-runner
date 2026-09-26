import { useRef } from 'react'
import { ControlBar } from './components/ControlBar.jsx'
import { ErrorBanner } from './components/ErrorBanner.jsx'
import { GameCanvas } from './components/GameCanvas.jsx'
import { GameStatus } from './components/GameStatus.jsx'
import { HUD } from './components/HUD.jsx'
import { JevPanel } from './components/JevPanel.jsx'
import { ModeIndicator } from './components/ModeIndicator.jsx'
import { Onboarding } from './components/Onboarding.jsx'
import { useBackendHealth } from './hooks/useBackendHealth.js'
import { useJevDecisions } from './hooks/useJevDecisions.js'

function App() {
  const { engineRef, panelState, backendDown, backendRecoveries } = useJevDecisions()
  const health = useBackendHealth(backendRecoveries)
  const toggleRef = useRef(null)

  function switchToHuman() {
    engineRef.current.setControlMode('human')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-lg font-medium tracking-tight text-text">Jev Pac-Runner</h1>
      <ModeIndicator health={backendDown ? null : health} />
      <Onboarding returnFocusRef={toggleRef} />
      <ErrorBanner visible={backendDown} onSwitchToHuman={switchToHuman} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <GameCanvas engineRef={engineRef} />
          <GameStatus engineRef={engineRef} />
        </div>
        <JevPanel panelState={panelState} />
      </div>
      <HUD engineRef={engineRef} />
      <ControlBar engineRef={engineRef} toggleRef={toggleRef} />
    </main>
  )
}

export default App
