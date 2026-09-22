import { describe, expect, it } from 'vitest'
import { isJunction, isWalkable, legalDirections, wrapX, width } from './maze.js'

describe('isWalkable', () => {
  it('treats pellet, power pellet and empty tiles as walkable', () => {
    expect(isWalkable(1, 1)).toBe(true) // .
    expect(isWalkable(1, 3)).toBe(true) // o
    expect(isWalkable(13, 14)).toBe(true) // ' ' inside the corridor to the house
  })

  it('treats walls and voids as never walkable, for anyone', () => {
    expect(isWalkable(0, 0)).toBe(false) // #
    expect(isWalkable(0, 10)).toBe(false) // X
    expect(isWalkable(0, 10, { isGhost: true })).toBe(false)
  })

  it('treats the ghost door as walkable only for ghosts', () => {
    // row 12: "XXXXX#.## ###--### ##.#XXXXX" -> door at x=14,15 y=12
    expect(isWalkable(14, 12)).toBe(false)
    expect(isWalkable(14, 12, { isGhost: true })).toBe(true)
  })
})

describe('tunnel wrap', () => {
  it('wraps x around the maze width on the tunnel row', () => {
    expect(wrapX(-1)).toBe(width - 1)
    expect(wrapX(width)).toBe(0)
    expect(wrapX(5)).toBe(5)
  })

  it('includes the wrap-around direction in legal directions at the tunnel edge', () => {
    // row 14 left edge (x=0) can walk RIGHT and, via wrap, LEFT into x=27
    const legal = legalDirections(0, 14)
    expect(legal).toContain('RIGHT')
    expect(legal).toContain('LEFT')
  })
})

describe('isJunction', () => {
  it('is true at a known 3-exit junction', () => {
    // row 8: "#......##....##......#" around x=6,y=8 there's a branch north into the corridor
    // Use the well-known 4-way intersection at the tunnel row entrance, x=6,y=8
    expect(isJunction(6, 8)).toBe(true)
  })

  it('is false in a straight corridor (2 opposite exits)', () => {
    expect(isJunction(2, 1)).toBe(false)
  })

  it('is true at a corner (2 exits that are not opposite)', () => {
    // (1,1): only DOWN and RIGHT are legal -- a corner, not a straight corridor
    expect(isJunction(1, 1)).toBe(true)
  })

  it('is false in a straight corridor even next to a power pellet', () => {
    // (1,3) is the power pellet niche: only UP/DOWN are legal, a corridor not a junction
    expect(isJunction(1, 3)).toBe(false)
  })
})
