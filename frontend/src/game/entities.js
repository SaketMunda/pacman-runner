import { maze } from './maze.js'

export const TICK_HZ = 30
export const TICK_MS = 1000 / TICK_HZ

// tiles per tick at normal speed
export const BASE_SPEED = 0.14

// Jev mode runs every entity at this fraction of normal speed. Measured live (Phase 6):
// Jev's p50 is ~400ms, but at full speed a 2-tile corridor lasts ~480ms, so short
// corridors missed their prefetch deadline and fell back. Slowing the clock -- not
// stretching the deadline -- is what buys headroom without the game waiting on Jev.
// Human mode is untouched.
export const JEV_SPEED_FACTOR = 0.75

/** Multiplier on every entity's speed for the given control mode. */
export function speedScale(controlMode) {
  return controlMode === 'jev' ? JEV_SPEED_FACTOR : 1
}

const DELTAS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
}

export function directionDelta(direction) {
  return DELTAS[direction] ?? { dx: 0, dy: 0 }
}

export function createPacRunner() {
  return {
    x: maze.pacSpawn.x,
    y: maze.pacSpawn.y,
    direction: maze.pacSpawnDirection,
    queuedDirection: null,
    progress: 0,
    speed: BASE_SPEED,
  }
}

export function createGhost(def) {
  return {
    name: def.name,
    color: def.color,
    scatterTarget: def.scatterTarget,
    releaseTicks: def.releaseTicks,
    x: def.spawn.x,
    y: def.spawn.y,
    direction: 'UP',
    progress: 0,
    speed: BASE_SPEED,
    mode: def.releaseTicks > 0 ? 'house' : 'scatter',
    frightenedTicksRemaining: 0,
  }
}

export function createGhosts() {
  return maze.ghosts.map(createGhost)
}
