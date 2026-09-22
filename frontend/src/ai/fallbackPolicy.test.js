import { describe, expect, it } from 'vitest'
import { decideFallback } from './fallbackPolicy.js'
import { legalDirections, maze } from '../game/maze.js'

// (12,23) is a real junction reached from pac spawn: legal = [UP, LEFT, RIGHT].
// The vertical shaft x=12, y=21..22 has no side branches, so a ghost placed
// in it is unambiguously "on the UP branch" vs "on the LEFT branch".
const JUNCTION = { x: 12, y: 23 }

function blankPelletsGrid() {
  // All pellets already eaten, so pellet distance never biases direction
  // choice in tests that only want to exercise the ghost term.
  return maze.grid.map((row) => row.split('').map((c) => (c === '.' || c === 'o' ? ' ' : c)))
}

function baseSnapshot(overrides = {}) {
  return {
    position: { ...JUNCTION },
    direction: 'LEFT', // reverse RIGHT excluded -> candidates [UP, LEFT]
    ghosts: [],
    ...overrides,
  }
}

describe('decideFallback', () => {
  it('only ever proposes legal directions', () => {
    const decision = decideFallback(baseSnapshot(), { pelletsGrid: blankPelletsGrid() })
    const legal = legalDirections(JUNCTION.x, JUNCTION.y)
    expect(legal).toContain(decision.move)
    for (const dir of Object.keys(decision.moveProbabilities)) {
      expect(legal).toContain(dir)
    }
  })

  it('never proposes the reverse direction while an alternative exists', () => {
    const decision = decideFallback(baseSnapshot({ direction: 'LEFT' }), {
      pelletsGrid: blankPelletsGrid(),
    })
    // reverse of LEFT is RIGHT, which is legal here but must be excluded
    expect(decision.moveProbabilities).not.toHaveProperty('RIGHT')
    expect(decision.move).not.toBe('RIGHT')
  })

  it('is deterministic for identical inputs', () => {
    const snapshot = baseSnapshot({ ghosts: [{ position: { x: 12, y: 21 }, mode: 'chase' }] })
    const pelletsGrid = blankPelletsGrid()
    const first = decideFallback(snapshot, { pelletsGrid })
    const second = decideFallback(snapshot, { pelletsGrid })
    expect(second).toEqual(first)
  })

  it('probabilities sum to ~1', () => {
    const decision = decideFallback(
      baseSnapshot({ ghosts: [{ position: { x: 12, y: 21 }, mode: 'chase' }] }),
      { pelletsGrid: blankPelletsGrid() },
    )
    const sum = Object.values(decision.moveProbabilities).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 5)
  })

  it('flees a chasing ghost on the closer branch', () => {
    const snapshot = baseSnapshot({
      direction: 'LEFT', // candidates: UP, LEFT
      ghosts: [{ position: { x: 12, y: 21 }, mode: 'chase' }], // 1 tile up the UP branch
    })
    const decision = decideFallback(snapshot, { pelletsGrid: blankPelletsGrid() })
    expect(decision.move).toBe('LEFT')
  })

  it('chases the same ghost once frightened', () => {
    const snapshot = baseSnapshot({
      direction: 'LEFT',
      ghosts: [{ position: { x: 12, y: 21 }, mode: 'frightened' }],
    })
    const decision = decideFallback(snapshot, { pelletsGrid: blankPelletsGrid() })
    expect(decision.move).toBe('UP')
  })
})
