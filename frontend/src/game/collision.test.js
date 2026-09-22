import { describe, expect, it } from 'vitest'
import {
  checkGhostCollision,
  createCollisionState,
  eatGhost,
  eatPellet,
  eatPowerPellet,
  GHOST_EAT_CHAIN,
  loseLife,
  PELLET_SCORE,
  POWER_PELLET_SCORE,
} from './collision.js'

function baseState(overrides = {}) {
  return { score: 0, pelletsRemaining: 5, lives: 3, status: 'playing', ...overrides }
}

describe('scoring', () => {
  it('awards 10 for a pellet and decrements the remaining count', () => {
    const state = baseState()
    eatPellet(state)
    expect(state.score).toBe(PELLET_SCORE)
    expect(state.pelletsRemaining).toBe(4)
  })

  it('awards 50 for a power pellet and frightens ghosts', () => {
    const state = baseState()
    const collisionState = createCollisionState()
    const ghosts = [{ mode: 'chase' }, { mode: 'scatter' }, { mode: 'eaten' }]
    eatPowerPellet(state, collisionState, ghosts, 180)
    expect(state.score).toBe(POWER_PELLET_SCORE)
    expect(ghosts[0].mode).toBe('frightened')
    expect(ghosts[0].frightenedTicksRemaining).toBe(180)
    expect(ghosts[1].mode).toBe('frightened')
    expect(ghosts[2].mode).toBe('eaten') // already-eaten ghosts stay eaten
  })

  it('scores the eat chain 200/400/800/1600 and holds at 1600 after', () => {
    const state = baseState()
    const collisionState = createCollisionState()
    const ghost = { mode: 'frightened' }
    for (const expected of [...GHOST_EAT_CHAIN, 1600]) {
      const before = state.score
      eatGhost(state, collisionState, ghost)
      expect(state.score - before).toBe(expected)
    }
    expect(ghost.mode).toBe('eaten')
  })

  it('resets the eat chain when a new power pellet is eaten', () => {
    const state = baseState()
    const collisionState = createCollisionState()
    const ghost = { mode: 'frightened' }
    eatGhost(state, collisionState, ghost) // chain index -> 1 (scored 200)
    eatPowerPellet(state, collisionState, [ghost], 180)
    expect(collisionState.ghostEatChainIndex).toBe(0)
    const before = state.score
    eatGhost(state, collisionState, ghost)
    expect(state.score - before).toBe(200) // back to the start of the chain
  })
})

describe('life loss and respawn', () => {
  it('decrements lives and marks respawning while lives remain', () => {
    const state = baseState({ lives: 2 })
    loseLife(state)
    expect(state.lives).toBe(1)
    expect(state.status).toBe('respawning')
  })

  it('marks gameover when the last life is lost', () => {
    const state = baseState({ lives: 1 })
    loseLife(state)
    expect(state.lives).toBe(0)
    expect(state.status).toBe('gameover')
  })
})

describe('ghost collision', () => {
  it('eats a frightened ghost instead of losing a life', () => {
    const state = baseState({ lives: 3 })
    const collisionState = createCollisionState()
    const ghost = { mode: 'frightened' }
    const result = checkGhostCollision(state, collisionState, ghost)
    expect(result).toBe('eaten')
    expect(state.lives).toBe(3)
    expect(ghost.mode).toBe('eaten')
  })

  it('passes through an already-eaten ghost (eyes) with no effect', () => {
    const state = baseState({ lives: 3 })
    const collisionState = createCollisionState()
    const ghost = { mode: 'eaten' }
    const result = checkGhostCollision(state, collisionState, ghost)
    expect(result).toBe('none')
    expect(state.lives).toBe(3)
  })

  it('loses a life when colliding with a chasing or scattering ghost', () => {
    const state = baseState({ lives: 3 })
    const collisionState = createCollisionState()
    const ghost = { mode: 'chase' }
    const result = checkGhostCollision(state, collisionState, ghost)
    expect(result).toBe('died')
    expect(state.lives).toBe(2)
  })
})

describe('win and game over', () => {
  it('wins when pellets remaining reaches 0', () => {
    const state = baseState({ pelletsRemaining: 1 })
    eatPellet(state)
    expect(state.pelletsRemaining).toBe(0)
    expect(state.status).toBe('won')
  })

  it('game overs at 0 lives', () => {
    const state = baseState({ lives: 1 })
    loseLife(state)
    expect(state.status).toBe('gameover')
  })
})
