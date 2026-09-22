import { describe, expect, it } from 'vitest'
import { chooseDirection, getChaseTarget } from './ghosts.js'

const pac = { x: 10, y: 10, direction: 'RIGHT' }
const blinky = { x: 12, y: 10 }
const scatterTarget = { x: 0, y: 0 }

describe('ghost chase targeting (fixed state)', () => {
  it('blinky targets pac-runner directly', () => {
    expect(getChaseTarget('blinky', { pac, blinky, scatterTarget })).toEqual({ x: 10, y: 10 })
  })

  it('pinky targets 4 tiles ahead of pac-runner facing direction', () => {
    expect(getChaseTarget('pinky', { pac, blinky, scatterTarget })).toEqual({ x: 14, y: 10 })
  })

  it('inky targets blinky reflected through the point 2 tiles ahead of pac-runner', () => {
    // pivot = (12, 10); reflection = pivot + (pivot - blinky) = (12,10) + (0,0) = (12,10)
    expect(getChaseTarget('inky', { pac, blinky, scatterTarget })).toEqual({ x: 12, y: 10 })
  })

  it('clyde chases directly when farther than 8 tiles, else retreats to its scatter corner', () => {
    const farClyde = { x: 0, y: 0 }
    expect(getChaseTarget('clyde', { pac, blinky, clyde: farClyde, scatterTarget })).toEqual({
      x: 10,
      y: 10,
    })

    const nearClyde = { x: 9, y: 10 }
    expect(getChaseTarget('clyde', { pac, blinky, clyde: nearClyde, scatterTarget })).toEqual(
      scatterTarget,
    )
  })
})

describe('no-reverse rule', () => {
  it('never picks the reverse of the current direction when another legal option exists', () => {
    const ghost = { x: 5, y: 5, direction: 'RIGHT' }
    // moving RIGHT currently; LEFT (reverse) and UP are both legal but target favours LEFT
    const target = { x: 0, y: 5 }
    const legalDirs = ['LEFT', 'UP']
    expect(chooseDirection(ghost, target, legalDirs)).toBe('UP')
  })

  it('falls back to reversing only when it is the sole legal direction', () => {
    const ghost = { x: 5, y: 5, direction: 'RIGHT' }
    const target = { x: 0, y: 5 }
    const legalDirs = ['LEFT']
    expect(chooseDirection(ghost, target, legalDirs)).toBe('LEFT')
  })

  it('breaks ties UP > LEFT > DOWN > RIGHT', () => {
    const ghost = { x: 5, y: 5, direction: 'UP' }
    // UP and LEFT are equidistant from a target directly between them
    const target = { x: 4, y: 4 }
    const legalDirs = ['UP', 'LEFT', 'RIGHT']
    expect(chooseDirection(ghost, target, legalDirs)).toBe('UP')
  })
})
