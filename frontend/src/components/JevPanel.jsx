import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/reducedMotion.js'

const AGGRESSION_LABELS = ['Flee', 'Cautious', 'Neutral', 'Hunting', 'Reckless']

const SOURCE_STYLES = {
  jev: 'bg-jev/15 text-jev border-jev/40',
  stub: 'bg-stub/15 text-stub border-stub/50',
  fallback: 'bg-fallback/15 text-fallback border-fallback/40',
}

const SOURCE_TEXT = { jev: 'text-jev', stub: 'text-stub', fallback: 'text-fallback' }

// Pulse in the colour of whoever chose the move -- a fallback pulsing in
// --jev would claim a decision Jev didn't make.
const PULSE_COLOR = { jev: 'var(--jev)', stub: 'var(--stub)', fallback: 'var(--fallback)' }
const PULSE_MS = 180

const FALLBACK_REASON_LABELS = {
  pending: 'still in flight',
  timeout: 'deadline',
  'backend-down': 'backend down',
  'illegal-move': 'illegal move',
}

/**
 * What the decision card says when there is no live decision to show. The
 * engine only ticks while `status === 'playing'`, so in Jev mode on any other
 * status nothing will ever arrive -- say so instead of looking hung.
 */
function idleMessage(controlMode, status, hasDecision) {
  if (controlMode !== 'jev') {
    return hasDecision ? null : 'Human control. Switch to Jev to watch it choose each turn.'
  }
  switch (status) {
    case 'ready':
      return 'Jev takes over when the game starts. Press Start.'
    case 'paused':
      return 'Paused. Jev resumes when you press Resume.'
    case 'won':
    case 'gameover':
      return 'Round over. Press Play again and Jev plays the next round.'
    default:
      return hasDecision ? null : 'Jev is playing — waiting for the first junction.'
  }
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
      className={`rounded-md border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide transition-colors duration-200 ${style}`}
    >
      {source ?? 'none'}
      {reason ? ` · ${reason}` : ''}
    </span>
  )
}

function CurrentDecisionCard({ decision, controlMode, status }) {
  const cardRef = useRef(null)

  useEffect(() => {
    const card = cardRef.current
    if (!decision || !card?.animate || prefersReducedMotion()) return
    const color = PULSE_COLOR[decision.source] ?? PULSE_COLOR.fallback
    card.animate(
      [
        { borderColor: color, boxShadow: `0 0 0 2px ${color}` },
        { borderColor: 'var(--border)', boxShadow: '0 0 0 0 transparent' },
      ],
      { duration: PULSE_MS, easing: 'ease-out' },
    )
  }, [decision])

  const idle = idleMessage(controlMode, status, Boolean(decision))

  return (
    <div
      ref={cardRef}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
    >
      <CardHeader>Current decision</CardHeader>
      {idle ? (
        <span className="text-sm text-text" data-testid="decision-idle">
          {idle}
        </span>
      ) : decision ? (
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
      ) : null}
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
        <ul className="flex flex-col gap-1 font-mono text-xs max-[900px]:[&>li:nth-child(n+4)]:hidden">
          {entries.map((entry) => (
            <li
              key={`${entry.junctionId}-${entry.at}`}
              className="flex items-center justify-between gap-2 text-text-dim"
            >
              <span className="text-text">{entry.junctionId}</span>
              <span>{entry.move}</span>
              <span className={SOURCE_TEXT[entry.source] ?? 'text-fallback'}>{entry.source}</span>
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
  const bySource = stats.bySource ?? {}
  const fallbacks = Object.entries(stats.fallbacks ?? {}).filter(([, n]) => n > 0)
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl border border-border bg-surface px-4 py-2 text-xs text-text-dim"
      data-testid="stats-line"
    >
      <div className="flex items-center justify-between">
        <span>
          Hit rate <span className="font-mono text-text">{hitRatePct}%</span>
        </span>
        <span>
          Median latency{' '}
          <span className="font-mono text-text">{median === null ? '—' : `${median}ms`}</span>
        </span>
      </div>
      {stats.requests > 0 && (
        <div className="flex flex-wrap gap-x-3 font-mono">
          <span>
            <span className="text-jev">jev</span> {bySource.jev ?? 0}
          </span>
          <span>
            <span className="text-stub">stub</span> {bySource.stub ?? 0}
          </span>
          <span>
            <span className="text-fallback">fallback</span> {bySource.fallback ?? 0}
          </span>
          {fallbacks.length > 0 && (
            <span>
              ({fallbacks.map(([r, n]) => `${FALLBACK_REASON_LABELS[r] ?? r} ${n}`).join(', ')})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function JevPanel({ panelState }) {
  const { currentDecision, decisionLog, stats, controlMode, status } = panelState

  return (
    <div className="flex h-full flex-col gap-3">
      <CurrentDecisionCard decision={currentDecision} controlMode={controlMode} status={status} />
      <ProbabilityBars probabilities={currentDecision?.moveProbabilities} />
      <AggressionMeter score={currentDecision?.aggressionScore} />
      <DecisionLog entries={decisionLog} />
      <StatsLine stats={stats} />
    </div>
  )
}
