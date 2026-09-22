import { maze } from './maze.js'

/**
 * Builds the exact camelCase shape of `GameStateIn` in backend/app/models.py.
 * No grid or maze geometry travels in the payload -- the backend already has
 * shared/maze.json and derives everything else from `mazeId`.
 */
export function buildSnapshot(engineState) {
  const { pac, ghosts, tick, powerTicksRemaining, pelletsRemaining, lives, score, junctionId } =
    engineState

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
    lives,
    score,
  }
}
