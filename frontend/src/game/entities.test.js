import { describe, expect, it } from 'vitest'
import { JEV_SPEED_FACTOR, speedScale } from './entities.js'
import { createEngine } from './loop.js'

describe('speedScale', () => {
  it('leaves human mode at full speed and slows only Jev mode', () => {
    expect(speedScale('human')).toBe(1)
    expect(speedScale('jev')).toBe(JEV_SPEED_FACTOR)
    expect(JEV_SPEED_FACTOR).toBeGreaterThan(0)
    expect(JEV_SPEED_FACTOR).toBeLessThan(1)
  })

  it('makes Pac-Runner cover proportionally less ground per tick in Jev mode', () => {
    const provider = { decide: () => ({ move: 'STAY', source: 'stub' }) }
    function progressAfterOneTick(mode) {
      const engine = createEngine({ decisionProvider: provider })
      engine.setControlMode(mode)
      engine.start()
      engine.tickOnce()
      return engine.state.pac.progress
    }
    expect(progressAfterOneTick('jev')).toBeCloseTo(progressAfterOneTick('human') * JEV_SPEED_FACTOR)
  })
})

describe('engine reset', () => {
  it('eats from the new board after a restart, not the previous round', () => {
    const engine = createEngine()
    // Round 1 cleared the board (as a won round does), then the player restarts.
    for (const row of engine.state.pelletsGrid) {
      for (let x = 0; x < row.length; x++) if (row[x] === '.' || row[x] === 'o') row[x] = ' '
    }
    engine.reset()
    engine.start()
    for (let i = 0; i < 60; i++) engine.tickOnce()
    expect(engine.state.score).toBeGreaterThan(0)
  })
})
