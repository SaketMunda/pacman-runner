import { maze } from './maze.js'

export const TICK_HZ = 30
export const TICK_MS = 1000 / TICK_HZ

// tiles per tick at normal speed
export const BASE_SPEED = 0.14

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
