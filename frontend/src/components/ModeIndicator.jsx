/**
 * Says plainly whether Jev is actually being called. Sourced from
 * /api/v1/health -- in stub mode the backend never contacts OpenRouter, and
 * without this line nothing on screen says so.
 */
function describe(health) {
  if (health === undefined) {
    return { label: 'checking', tone: 'dim', text: 'Checking backend mode…' }
  }
  if (health === null) {
    return {
      label: 'offline',
      tone: 'fallback',
      text: 'Backend unreachable — moves come from the in-browser fallback policy. Jev is not being called.',
    }
  }
  if (health.mode === 'live' && health.keyConfigured) {
    return {
      label: 'live',
      tone: 'jev',
      text: `Live — each junction is sent to Jev (${health.model ?? 'Jev'}) through OpenRouter.`,
    }
  }
  return {
    label: 'stub',
    tone: 'stub',
    text: 'Stub mode — decisions are local, Jev is not being called.',
  }
}

const TONE_STYLES = {
  jev: 'border-jev/40 text-jev',
  stub: 'border-stub/50 text-stub',
  fallback: 'border-fallback/40 text-fallback',
  dim: 'border-border text-text-dim',
}

export function ModeIndicator({ health }) {
  const { label, tone, text } = describe(health)
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm"
      data-testid="mode-indicator"
    >
      <span
        className={`mt-0.5 shrink-0 rounded-md border bg-surface-2 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide ${TONE_STYLES[tone]}`}
      >
        {label}
      </span>
      <span className="text-text">{text}</span>
    </div>
  )
}
