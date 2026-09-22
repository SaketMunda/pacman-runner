import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'jev-pac-runner:onboarding-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // ignore -- storage unavailable (private mode, quota, etc.)
  }
}

export function Onboarding({ returnFocusRef }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const dismissButtonRef = useRef(null)

  useEffect(() => {
    if (dismissed) return
    function onKeyDown(event) {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed])

  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    writeDismissed()
    returnFocusRef?.current?.focus()
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-jev/40 bg-jev/10 px-4 py-3 text-sm text-text">
      <span>
        In Jev mode, Jev picks each turn at a junction, and the panel on the right shows how
        sure it was.
      </span>
      <button
        ref={dismissButtonRef}
        type="button"
        onClick={dismiss}
        className="ml-auto rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-jev"
      >
        Got it
      </button>
    </div>
  )
}
