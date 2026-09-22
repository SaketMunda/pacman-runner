const AGGRESSION_LABELS = ['Flee', 'Cautious', 'Neutral', 'Hunting', 'Reckless']

const SOURCE_STYLES = {
  jev: 'bg-jev/15 text-jev border-jev/40',
  stub: 'bg-jev-dim/20 text-jev-dim border-jev-dim/50',
  fallback: 'bg-fallback/15 text-fallback border-fallback/40',
}

function CardHeader({ children }) {
  return (
    <span className="text-[0.7rem] uppercase tracking-[0.08em] text-text-dim">{children}</span>
  )
}

function SourceBadge({ source, reason }) {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.fallback
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide ${style}`}
    >
      {source ?? 'none'}
      {reason ? ` · ${reason}` : ''}
    </span>
  )
}

function CurrentDecisionCard({ decision }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <CardHeader>Current decision</CardHeader>
      {decision ? (
        <div className="flex items-center justify-between">
          <span className="font-mono text-2xl text-text">{decision.move}</span>
          <div className="flex flex-col items-end gap-1">
            <SourceBadge source={decision.source} reason={decision.reason} />
            {typeof decision.confidence === 'number' && (
              <span className="text-xs text-text-dim">
                confidence {(decision.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      ) : (
        <span className="text-sm text-text-dim">No decision yet.</span>
      )}
    </div>
  )
}

function ProbabilityBars({ probabilities }) {
  const entries = Object.entries(probabilities ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <CardHeader>Probabilities</CardHeader>
      {entries.length === 0 ? (
        <span className="text-sm text-text-dim">—</span>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([direction, probability]) => (
            <div key={direction} className="flex items-center gap-2">
              <span className="w-14 font-mono text-xs text-text-dim">{direction}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-jev transition-[width] duration-[220ms] ease-[cubic-bezier(.4,0,.2,1)]"
                  style={{ width: `${Math.round(probability * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right font-mono text-xs text-text">
                {Math.round(probability * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AggressionMeter({ score }) {
  const clamped = typeof score === 'number' ? Math.min(4, Math.max(0, score)) : null
  const percent = clamped === null ? 0 : (clamped / 4) * 100
  const label = clamped === null ? '—' : AGGRESSION_LABELS[Math.round(clamped)]
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <CardHeader>Aggression</CardHeader>
      <div className="relative h-2 rounded-full bg-surface-2">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-jev transition-[left] duration-[260ms]"
          style={{ left: `calc(${percent}% - 6px)` }}
        />
      </div>
      <div className="flex items-baseline justify-between text-xs text-text-dim">
        <span>{clamped === null ? '—' : clamped.toFixed(1)}</span>
        <span className="text-text">{label}</span>
      </div>
    </div>
  )
}

function DecisionLog({ entries }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <CardHeader>Decision log</CardHeader>
      {entries.length === 0 ? (
        <span className="text-sm text-text-dim">—</span>
      ) : (
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {entries.map((entry) => (
            <li
              key={`${entry.junctionId}-${entry.at}`}
              className="flex items-center justify-between gap-2 text-text-dim"
            >
              <span className="text-text">{entry.junctionId}</span>
              <span>{entry.move}</span>
              <span className={entry.source === 'fallback' ? 'text-fallback' : 'text-jev'}>
                {entry.source}
              </span>
              <span>{entry.latencyMs !== null ? `${entry.latencyMs}ms` : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatsLine({ stats }) {
  const hitRatePct = Math.round((stats.hitRate ?? 0) * 100)
  const median = stats.medianLatencyMs
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2 text-xs text-text-dim">
      <span>
        Hit rate <span className="font-mono text-text">{hitRatePct}%</span>
      </span>
      <span>
        Median latency{' '}
        <span className="font-mono text-text">{median === null ? '—' : `${median}ms`}</span>
      </span>
    </div>
  )
}

export function JevPanel({ panelState }) {
  const { currentDecision, decisionLog, stats } = panelState

  return (
    <div className="flex h-full flex-col gap-3">
      <CurrentDecisionCard decision={currentDecision} />
      <ProbabilityBars probabilities={currentDecision?.moveProbabilities} />
      <AggressionMeter score={currentDecision?.aggressionScore} />
      <DecisionLog entries={decisionLog} />
      <StatsLine stats={stats} />
    </div>
  )
}
