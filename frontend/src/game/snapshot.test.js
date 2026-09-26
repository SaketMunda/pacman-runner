import { describe, expect, it } from 'vitest'
import { maze } from './maze.js'
import { buildSnapshot, eatenPellets } from './snapshot.js'

function fixtureEngineState() {
  return {
    tick: 42,
    pac: { x: 13, y: 23, direction: 'LEFT' },
    junctionId: '13,20',
    ghosts: [
      { name: 'blinky', x: 13, y: 11, mode: 'scatter', direction: 'UP' },
      { name: 'pinky', x: 13, y: 14, mode: 'house', direction: 'UP' },
    ],
    powerTicksRemaining: 0,
    pelletsRemaining: 240,
    lives: 3,
    score: 0,
  }
}

describe('buildSnapshot', () => {
  it('matches the exact camelCase keys of GameStateIn', () => {
    const snapshot = buildSnapshot(fixtureEngineState())
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        'mazeId',
        'tick',
        'position',
        'direction',
        'junctionId',
        'ghosts',
        'powerTicksRemaining',
        'pelletsRemaining',
        'eatenPellets',
        'lives',
        'score',
      ].sort(),
    )
    expect(Object.keys(snapshot.position).sort()).toEqual(['x', 'y'])
    for (const ghost of snapshot.ghosts) {
      expect(Object.keys(ghost).sort()).toEqual(['name', 'position', 'mode', 'direction'].sort())
      expect(Object.keys(ghost.position).sort()).toEqual(['x', 'y'])
    }
  })

  it('carries no grid or maze geometry in the payload', () => {
    const snapshot = buildSnapshot(fixtureEngineState())
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('grid')
    expect(serialized).not.toContain('legend')
  })

  it('reflects the given engine state values', () => {
    const snapshot = buildSnapshot(fixtureEngineState())
    expect(snapshot.tick).toBe(42)
    expect(snapshot.position).toEqual({ x: 13, y: 23 })
    expect(snapshot.direction).toBe('LEFT')
    expect(snapshot.junctionId).toBe('13,20')
    expect(snapshot.pelletsRemaining).toBe(240)
    expect(snapshot.lives).toBe(3)
    expect(snapshot.score).toBe(0)
  })
})

describe('eatenPellets', () => {
  const freshGrid = () => maze.grid.map((row) => row.split(''))

  it('is empty for an untouched board and when no grid is given', () => {
    expect(eatenPellets(freshGrid())).toEqual([])
    expect(eatenPellets(undefined)).toEqual([])
  })

  it('lists exactly the eaten pellet and power-pellet tiles as [x, y]', () => {
    const grid = freshGrid()
    const pellet = grid[1].indexOf('.')
    const powerRow = grid.findIndex((row) => row.includes('o'))
    const power = grid[powerRow].indexOf('o')
    grid[1][pellet] = ' '
    grid[powerRow][power] = ' '
    expect(eatenPellets(grid)).toEqual(
      [
        [pellet, 1],
        [power, powerRow],
      ].sort((a, b) => a[1] - b[1]),
    )
  })
})
