import { decideFallback } from './fallbackPolicy.js'
import { fetchDecision, DecisionError } from './jevClient.js'
import { speedScale, TICK_HZ } from '../game/entities.js'
import { isWalkable, legalDirections, wrapX } from '../game/maze.js'
import { buildSnapshot } from '../game/snapshot.js'

const DELTAS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
}

const DEADLINE_FLOOR_MS = 60
const DEADLINE_CEILING_MS = 1000
const LATENCY_HISTORY = 20

/** Tile-steps from the entity's current tile to the junction, walking forward along `direction`. */
function tilesToJunction(pac, junctionX, junctionY, maxSteps) {
  let { x, y } = pac
  const { direction } = pac
  for (let steps = 0; steps < maxSteps; steps++) {
    if (x === junctionX && y === junctionY) return steps
    const { dx, dy } = DELTAS[direction]
    const nx = wrapX(x + dx)
    const ny = y + dy
    if (!isWalkable(nx, ny)) return steps
    x = nx
    y = ny
  }
  return maxSteps
}

/**
 * Pellet tiles Pac-Runner will eat on its way to the junction -- from the
 * current tile up to and including the junction. The prefetched snapshot is
 * projected to the junction, so these must count as eaten; otherwise Jev is
 * told the corridor it is leaving still has a pellet one tile back.
 */
export function pelletsOnWayToJunction(state, junctionX, junctionY) {
  const tiles = []
  let { x, y } = state.pac
  const { dx, dy } = DELTAS[state.pac.direction] ?? { dx: 0, dy: 0 }
  const maxSteps = state.pelletsGrid.length * (state.pelletsGrid[0]?.length ?? 1)
  for (let steps = 0; steps < maxSteps; steps++) {
    const cell = state.pelletsGrid[y]?.[x]
    if (cell === '.' || cell === 'o') tiles.push([x, y])
    if (x === junctionX && y === junctionY) break
    const nx = wrapX(x + dx)
    const ny = y + dy
    if (!isWalkable(nx, ny)) break
    x = nx
    y = ny
  }
  return tiles
}

function computeDeadlineMs(state, junctionX, junctionY) {
  const maxSteps = state.pelletsGrid.length * (state.pelletsGrid[0]?.length ?? 1)
  const tiles = tilesToJunction(state.pac, junctionX, junctionY, maxSteps)
  const speed = state.pac.speed * speedScale(state.controlMode)
  const ticksRemaining = Math.max(0, (tiles - state.pac.progress) / speed)
  const ms = (ticksRemaining / TICK_HZ) * 1000
  return Math.min(DEADLINE_CEILING_MS, Math.max(DEADLINE_FLOOR_MS, ms))
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Owns the one in-flight Jev request. `decide` is the synchronous
 * `decisionProvider` the engine calls at a junction; `onTick` is called
 * every engine tick (by the engine or the React hook) to fire prefetches
 * ahead of arrival. Network calls never happen inside `decide` itself.
 */
export function createDecisionScheduler() {
  let pendingSlot = null
  let seqCounter = 0
  let lastJunctionId = null
  let lastControlMode = null
  let lastPelletsGrid = null

  const counters = {
    requests: 0,
    hits: 0,
    fallbacks: { timeout: 0, pending: 0, 'illegal-move': 0, 'backend-down': 0 },
    // Who actually chose each applied move. In live mode the backend answers a
    // Jev timeout with source 'stub', so `hits` alone overstates Jev's share.
    bySource: { jev: 0, stub: 0, fallback: 0 },
  }
  const latencies = []

  function recordLatency(ms) {
    if (typeof ms !== 'number') return
    latencies.push(ms)
    if (latencies.length > LATENCY_HISTORY) latencies.shift()
  }

  function abortPending() {
    if (pendingSlot && pendingSlot.status === 'pending') {
      pendingSlot.controller.abort()
    }
  }

  function firePrefetch(state) {
    const junctionId = state.junctionId
    if (!junctionId) return
    const [jx, jy] = junctionId.split(',').map(Number)

    abortPending()

    const seq = ++seqCounter
    const controller = new AbortController()
    const timeoutMs = computeDeadlineMs(state, jx, jy)
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const snapshot = buildSnapshot(state)
    snapshot.position = { x: jx, y: jy }
    snapshot.eatenPellets = [...snapshot.eatenPellets, ...pelletsOnWayToJunction(state, jx, jy)]

    const slot = {
      junctionId,
      seq,
      controller,
      status: 'pending',
      reply: null,
      reason: null,
      latencyMs: null,
    }
    pendingSlot = slot
    const startedAt = performance.now()

    fetchDecision(snapshot, { signal: controller.signal }).then(
      (reply) => {
        clearTimeout(timer)
        if (pendingSlot !== slot) return // superseded by a newer prefetch
        slot.status = 'resolved-ok'
        slot.reply = reply
        slot.latencyMs = Math.round(performance.now() - startedAt)
      },
      (err) => {
        clearTimeout(timer)
        if (pendingSlot !== slot) return
        slot.status = 'resolved-error'
        slot.reason = err instanceof DecisionError ? err.reason : 'backend-down'
        slot.latencyMs = Math.round(performance.now() - startedAt)
      },
    )
  }

  function fallbackDecision(snapshot, pelletsGrid, reason) {
    counters.fallbacks[reason] = (counters.fallbacks[reason] ?? 0) + 1
    counters.bySource.fallback += 1
    const decision = decideFallback(snapshot, { pelletsGrid })
    return { ...decision, reason }
  }

  function decide(snapshot) {
    counters.requests += 1
    const junctionId = snapshot.junctionId
    const pelletsGrid = lastPelletsGrid

    const slot = pendingSlot
    const matches = slot && slot.junctionId === junctionId
    pendingSlot = null // consumed either way -- a revisited junction never reuses this reply

    if (!matches) {
      return fallbackDecision(snapshot, pelletsGrid, 'pending')
    }

    if (slot.status === 'pending') {
      return fallbackDecision(snapshot, pelletsGrid, 'pending')
    }

    if (slot.status === 'resolved-error') {
      const reason = slot.reason === 'timeout' ? 'timeout' : 'backend-down'
      return fallbackDecision(snapshot, pelletsGrid, reason)
    }

    // resolved-ok
    const { x, y } = snapshot.position
    const legal = legalDirections(x, y)
    if (!legal.includes(slot.reply.move)) {
      return fallbackDecision(snapshot, pelletsGrid, 'illegal-move')
    }

    counters.hits += 1
    counters.bySource[slot.reply.source] = (counters.bySource[slot.reply.source] ?? 0) + 1
    recordLatency(slot.latencyMs)
    return {
      move: slot.reply.move,
      source: slot.reply.source,
      moveProbabilities: slot.reply.moveProbabilities,
      aggressionScore: slot.reply.aggressionScore,
      confidence: slot.reply.confidence,
      latencyMs: slot.latencyMs,
    }
  }

  function onTick(state) {
    lastPelletsGrid = state.pelletsGrid

    if (state.controlMode !== 'jev' || state.status !== 'playing') {
      lastControlMode = state.controlMode
      return
    }

    const justSwitchedToJev = lastControlMode !== 'jev'
    lastControlMode = state.controlMode

    if (justSwitchedToJev || state.junctionId !== lastJunctionId) {
      lastJunctionId = state.junctionId
      firePrefetch(state)
    }
  }

  function reset() {
    abortPending()
    pendingSlot = null
    lastJunctionId = null
    lastControlMode = null
  }

  function getStats() {
    const hitRate = counters.requests > 0 ? counters.hits / counters.requests : 0
    return {
      requests: counters.requests,
      hits: counters.hits,
      hitRate,
      fallbacks: { ...counters.fallbacks },
      bySource: { ...counters.bySource },
      medianLatencyMs: median(latencies),
    }
  }

  return { decide, onTick, reset, getStats }
}
