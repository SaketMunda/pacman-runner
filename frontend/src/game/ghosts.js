import { TICK_HZ } from './entities.js'
import { isJunction, legalDirections, wrapX } from './maze.js'

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

// classic scatter/chase schedule in seconds, alternating starting with scatter
const PHASE_SCHEDULE_SECONDS = [7, 20, 7, 20, 5, 20, 5, Infinity]

export const FRIGHTENED_TICKS = 6 * TICK_HZ
export const FRIGHTENED_FLASH_TICKS = 2 * TICK_HZ

export function phaseAtTick(tick) {
  let elapsed = tick / TICK_HZ
  for (let i = 0; i < PHASE_SCHEDULE_SECONDS.length; i++) {
    const duration = PHASE_SCHEDULE_SECONDS[i]
    if (elapsed < duration) return i % 2 === 0 ? 'scatter' : 'chase'
    elapsed -= duration
  }
  return 'chase'
}

function nextTile(x, y, direction) {
  const { dx, dy } = DELTAS[direction]
  return { x: wrapX(x + dx), y: y + dy }
}

/**
 * Blinky: pac-runner's current tile.
 * Pinky: 4 tiles ahead of pac-runner's facing direction.
 * Inky: blinky's tile reflected through the point 2 tiles ahead of pac-runner.
 * Clyde: like Blinky when farther than 8 tiles away, else its scatter corner.
 */
export function getChaseTarget(name, { pac, blinky, clyde, scatterTarget }) {
  const ahead = (n) => {
    let { x, y } = pac
    for (let i = 0; i < n; i++) {
      ;({ x, y } = nextTile(x, y, pac.direction))
    }
    return { x, y }
  }

  switch (name) {
    case 'blinky':
      return { x: pac.x, y: pac.y }
    case 'pinky':
      return ahead(4)
    case 'inky': {
      const pivot = ahead(2)
      return {
        x: pivot.x + (pivot.x - blinky.x),
        y: pivot.y + (pivot.y - blinky.y),
      }
    }
    case 'clyde': {
      const distance = Math.sqrt(distanceSquared(clyde, pac))
      return distance > 8 ? { x: pac.x, y: pac.y } : scatterTarget
    }
    default:
      return scatterTarget
  }
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

/**
 * Pick the direction from `legalDirs` that minimises distance to `target`,
 * excluding the reverse of the ghost's current direction unless `allowReverse`.
 * Ties break UP > LEFT > DOWN > RIGHT.
 */
export function chooseDirection(ghost, target, legalDirs, { allowReverse = false } = {}) {
  const reverse = OPPOSITE[ghost.direction]
  let candidates = legalDirs.filter((d) => allowReverse || d !== reverse)
  if (candidates.length === 0) candidates = legalDirs

  let best = null
  let bestDist = Infinity
  for (const dir of DIRECTION_ORDER) {
    if (!candidates.includes(dir)) continue
    const { x, y } = nextTile(ghost.x, ghost.y, dir)
    const dist = distanceSquared({ x, y }, target)
    if (dist < bestDist) {
      bestDist = dist
      best = dir
    }
  }
  return best ?? ghost.direction
}

export function chooseFrightenedDirection(ghost, legalDirs, rng = Math.random) {
  const reverse = OPPOSITE[ghost.direction]
  let candidates = legalDirs.filter((d) => d !== reverse)
  if (candidates.length === 0) candidates = legalDirs
  const index = Math.floor(rng() * candidates.length)
  return candidates[index]
}

export function isGhostAtJunction(ghost) {
  return isJunction(ghost.x, ghost.y, { isGhost: true })
}

export function ghostLegalDirections(ghost) {
  return legalDirections(ghost.x, ghost.y, { isGhost: true })
}
