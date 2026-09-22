import mazeData from '../../../shared/maze.json'

export const maze = mazeData
export const { width, height, grid, legend } = mazeData

const DIRECTIONS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
}

const OPPOSITE = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

export function tileAt(x, y) {
  const row = grid[y]
  if (row === undefined) return undefined
  return row[x]
}

/**
 * `-` (ghost door) is only walkable by ghosts; `#` and `X` are never walkable.
 */
export function isWalkable(x, y, { isGhost = false } = {}) {
  const tile = tileAt(x, y)
  if (tile === undefined) return false
  if (tile === '#' || tile === 'X') return false
  if (tile === '-') return isGhost
  return tile === '.' || tile === 'o' || tile === ' '
}

export function legalDirections(x, y, { isGhost = false } = {}) {
  const legal = []
  for (const [name, { dx, dy }] of Object.entries(DIRECTIONS)) {
    const nx = wrapX(x + dx)
    const ny = y + dy
    if (isWalkable(nx, ny, { isGhost })) legal.push(name)
  }
  return legal
}

export function wrapX(x) {
  if (x < 0) return width - 1
  if (x >= width) return 0
  return x
}

/**
 * A junction is a tile with >=3 exits, or exactly 2 exits that aren't opposite
 * (i.e. a corner). A plain corridor (2 opposite exits) or a dead end (1 exit)
 * is not a junction.
 */
export function isJunction(x, y, { isGhost = false } = {}) {
  const legal = legalDirections(x, y, { isGhost })
  if (legal.length >= 3) return true
  if (legal.length === 2) {
    const [a, b] = legal
    return OPPOSITE[a] !== b
  }
  return false
}

export function isTunnelRow(y) {
  return maze.tunnels.some((t) => t.row === y)
}
