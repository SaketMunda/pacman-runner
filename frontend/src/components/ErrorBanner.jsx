export function ErrorBanner({ visible, onSwitchToHuman }) {
  if (!visible) return null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-text"
    >
      <span>
        Jev backend is unreachable. Pac-Runner keeps playing on the local fallback policy.
      </span>
      <button
        type="button"
        onClick={onSwitchToHuman}
        className="ml-auto rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-jev"
      >
        Switch to human control
      </button>
    </div>
  )
}
