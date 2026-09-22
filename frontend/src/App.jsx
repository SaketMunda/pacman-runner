import { useRef } from 'react'
import { ControlBar } from './components/ControlBar.jsx'
import { ErrorBanner } from './components/ErrorBanner.jsx'
import { GameCanvas } from './components/GameCanvas.jsx'
import { HUD } from './components/HUD.jsx'
import { JevPanel } from './components/JevPanel.jsx'
import { Onboarding } from './components/Onboarding.jsx'
import { useJevDecisions } from './hooks/useJevDecisions.js'

function App() {
  const { engineRef, panelState, backendDown } = useJevDecisions()
  const toggleRef = useRef(null)

  function switchToHuman() {
    engineRef.current.setControlMode('human')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-lg font-medium tracking-tight text-text">Jev Pac-Runner</h1>
      <Onboarding returnFocusRef={toggleRef} />
      <ErrorBanner visible={backendDown} onSwitchToHuman={switchToHuman} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_22rem]">
        <GameCanvas engineRef={engineRef} />
        <JevPanel panelState={panelState} />
      </div>
      <HUD engineRef={engineRef} />
      <ControlBar engineRef={engineRef} toggleRef={toggleRef} />
    </div>
  )
}

export default App
