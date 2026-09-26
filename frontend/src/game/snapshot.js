import { maze } from './maze.js'

/**
 * Builds the exact camelCase shape of `GameStateIn` in backend/app/models.py.
 * No grid or maze geometry travels in the payload -- the backend already has
 * shared/maze.json and derives everything else from `mazeId`.
 */
/**
 * [x, y] of every pellet or power pellet the start layout had that is gone now.
 * The backend knows the start layout from shared/maze.json; without this it
 * would describe every corridor to Jev as still full of pellets.
 */
export function eatenPellets(pelletsGrid) {
  const eaten = []
  if (!pelletsGrid) return eaten
  for (let y = 0; y < maze.grid.length; y++) {
    const start = maze.grid[y]
    const now = pelletsGrid[y]
    for (let x = 0; x < start.length; x++) {
      if ((start[x] === '.' || start[x] === 'o') && now[x] !== start[x]) eaten.push([x, y])
    }
  }
  return eaten
}

export function buildSnapshot(engineState) {
  const {
    pac,
    ghosts,
    tick,
    powerTicksRemaining,
    pelletsRemaining,
    pelletsGrid,
    lives,
    score,
    junctionId,
  } = engineState

  return {
    mazeId: maze.id,
    tick,
    position: { x: pac.x, y: pac.y },
    direction: pac.direction,
    junctionId,
    ghosts: ghosts.map((ghost) => ({
      name: ghost.name,
      position: { x: ghost.x, y: ghost.y },
      mode: ghost.mode,
      direction: ghost.direction,
    })),
    powerTicksRemaining,
    pelletsRemaining,
    eatenPellets: eatenPellets(pelletsGrid),
    lives,
    score,
  }
}
