export const PELLET_SCORE = 10
export const POWER_PELLET_SCORE = 50
export const GHOST_EAT_CHAIN = [200, 400, 800, 1600]

export function createCollisionState() {
  return { ghostEatChainIndex: 0 }
}

export function eatPellet(state) {
  state.pelletsRemaining -= 1
  state.score += PELLET_SCORE
  if (state.pelletsRemaining <= 0) {
    state.status = 'won'
  }
}

/**
 * Eating a power pellet scores flat points, frightens all non-eaten ghosts,
 * and resets the ghost-eat chain multiplier for this power window.
 */
export function eatPowerPellet(state, collisionState, ghosts, frightenedTicks) {
  state.pelletsRemaining -= 1
  state.score += POWER_PELLET_SCORE
  state.powerTicksRemaining = frightenedTicks
  collisionState.ghostEatChainIndex = 0
  for (const ghost of ghosts) {
    if (ghost.mode !== 'eaten') {
      ghost.mode = 'frightened'
      ghost.frightenedTicksRemaining = frightenedTicks
    }
  }
  if (state.pelletsRemaining <= 0) {
    state.status = 'won'
  }
}

/**
 * Eating a frightened ghost scores the next value in the 200/400/800/1600
 * chain and sends the ghost's eyes home. The chain resets whenever a new
 * power pellet is eaten (see eatPowerPellet), not when it's exhausted.
 */
export function eatGhost(state, collisionState, ghost) {
  const index = Math.min(collisionState.ghostEatChainIndex, GHOST_EAT_CHAIN.length - 1)
  state.score += GHOST_EAT_CHAIN[index]
  collisionState.ghostEatChainIndex += 1
  ghost.mode = 'eaten'
  ghost.frightenedTicksRemaining = 0
}

export function loseLife(state) {
  state.lives -= 1
  if (state.lives <= 0) {
    state.status = 'gameover'
  } else {
    state.status = 'respawning'
  }
}

export function checkGhostCollision(state, collisionState, ghost) {
  if (ghost.mode === 'frightened') {
    eatGhost(state, collisionState, ghost)
    return 'eaten'
  }
  if (ghost.mode === 'eaten') {
    return 'none'
  }
  loseLife(state)
  return 'died'
}
