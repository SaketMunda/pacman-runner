import { isWalkable, legalDirections, wrapX } from '../game/maze.js'

/**
 * Local greedy policy used whenever the backend reply isn't ready or valid.
 * No React, no network -- deterministic BFS over the static maze walls, with
 * pellet locations coming from the caller's current `pelletsGrid` (walls
 * never change, but pellets get eaten, so they can't be baked in).
 */

const DIRECTION_ORDER = ['UP', 'LEFT', 'DOWN', 'RIGHT']

const DELTAS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
}

const OPPOSITE = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

const PELLET_WEIGHT = 1
const GHOST_FLEE_WEIGHT = 6
const GHOST_CHASE_WEIGHT = 4
const NO_PELLET_DISTANCE = 999

function key(x, y) {
  return `${x},${y}`
}

/** Tunnel-aware BFS over walkable tiles only (walls are static maze geometry). */
function bfsDistances(startX, startY) {
  const dist = new Map()
  if (!isWalkable(startX, startY)) return dist
  dist.set(key(startX, startY), 0)
  const queue = [[startX, startY]]
  let head = 0
  while (head < queue.length) {
    const [cx, cy] = queue[head]
    head += 1
    const d = dist.get(key(cx, cy))
    for (const dir of DIRECTION_ORDER) {
      const { dx, dy } = DELTAS[dir]
      const nx = wrapX(cx + dx)
      const ny = cy + dy
      if (!isWalkable(nx, ny)) continue
      const k = key(nx, ny)
      if (!dist.has(k)) {
        dist.set(k, d + 1)
        queue.push([nx, ny])
      }
    }
  }
  return dist
}

function nearestPelletDistance(dist, pelletsGrid) {
  let best = Infinity
  for (const [k, d] of dist) {
    const [x, y] = k.split(',').map(Number)
    const cell = pelletsGrid[y]?.[x]
    if ((cell === '.' || cell === 'o') && d < best) best = d
  }
  return best === Infinity ? NO_PELLET_DISTANCE : best
}

function nearestGhost(dist, ghosts) {
  let best = null
  for (const ghost of ghosts) {
    const d = dist.get(key(ghost.position.x, ghost.position.y))
    if (d === undefined) continue
    if (best === null || d < best.distance) {
      best = { distance: d, frightened: ghost.mode === 'frightened' }
    }
  }
  return best
}

function softmax(scores, keys) {
  const max = Math.max(...keys.map((k) => scores[k]))
  const exps = keys.map((k) => Math.exp(scores[k] - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  const probs = {}
  keys.forEach((k, i) => {
    probs[k] = exps[i] / sum
  })
  return probs
}

function argmax(scores, keys) {
  let best = keys[0]
  let bestScore = -Infinity
  for (const dir of DIRECTION_ORDER) {
    if (!keys.includes(dir)) continue
    if (scores[dir] > bestScore) {
      bestScore = scores[dir]
      best = dir
    }
  }
  return best
}

/**
 * `snapshot` is the wire-format GameStateIn shape (see game/snapshot.js);
 * `pelletsGrid` is the engine's live pellet grid, which never travels over
 * the wire. Scores each legal direction by nearest-pellet distance minus a
 * ghost-proximity penalty, inverted for frightened ghosts while powered.
 */
export function decideFallback(snapshot, { pelletsGrid }) {
  const { x, y } = snapshot.position
  const legal = legalDirections(x, y)
  if (legal.length === 0) {
    return { move: 'STAY', moveProbabilities: {}, source: 'fallback' }
  }

  const reverse = OPPOSITE[snapshot.direction]
  const candidates = legal.filter((d) => d !== reverse)
  const options = candidates.length > 0 ? candidates : legal

  const scores = {}
  for (const dir of options) {
    const { dx, dy } = DELTAS[dir]
    const nx = wrapX(x + dx)
    const ny = y + dy
    const dist = bfsDistances(nx, ny)
    const pelletDistance = nearestPelletDistance(dist, pelletsGrid)
    const ghost = nearestGhost(dist, snapshot.ghosts ?? [])

    let score = -pelletDistance * PELLET_WEIGHT
    if (ghost) {
      const proximity = 1 / (ghost.distance + 1)
      score += ghost.frightened ? proximity * GHOST_CHASE_WEIGHT : -proximity * GHOST_FLEE_WEIGHT
    }
    scores[dir] = score
  }

  const moveProbabilities = softmax(scores, options)
  const move = argmax(scores, options)
  return { move, moveProbabilities, source: 'fallback' }
}

export const fallbackPolicy = { decide: decideFallback }
