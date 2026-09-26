import {
  checkGhostCollision,
  createCollisionState,
  eatPellet,
  eatPowerPellet,
} from './collision.js'
import { stubDecisionProvider } from './decisionProvider.js'
import {
  createGhosts,
  createPacRunner,
  directionDelta,
  speedScale,
  TICK_HZ,
  TICK_MS,
} from './entities.js'
import {
  chooseDirection,
  chooseFrightenedDirection,
  FRIGHTENED_TICKS,
  getChaseTarget,
  ghostLegalDirections,
  isGhostAtJunction,
  phaseAtTick,
} from './ghosts.js'
import { isJunction, isWalkable, legalDirections, maze, wrapX } from './maze.js'
import { buildSnapshot } from './snapshot.js'

export { TICK_HZ, TICK_MS }

function countPellets() {
  let count = 0
  for (const row of maze.grid) {
    for (const cell of row) {
      if (cell === '.' || cell === 'o') count += 1
    }
  }
  return count
}

function collectPelletsGrid() {
  return maze.grid.map((row) => row.split(''))
}

/**
 * The junction Pac-Runner is heading toward: walk forward along the current
 * direction from the current tile until a junction (or a wall) is reached.
 */
function findUpcomingJunction(x, y, direction) {
  let cx = x
  let cy = y
  const { dx, dy } = directionDelta(direction)
  for (let i = 0; i < maze.width * maze.height; i++) {
    if (isJunction(cx, cy)) return { x: cx, y: cy }
    const nx = wrapX(cx + dx)
    const ny = cy + dy
    if (!isWalkable(nx, ny, { isGhost: false })) return { x: cx, y: cy }
    cx = nx
    cy = ny
  }
  return { x: cx, y: cy }
}

export function createEngine({ decisionProvider = stubDecisionProvider } = {}) {
  const state = {
    tick: 0,
    pac: createPacRunner(),
    ghosts: createGhosts(),
    // Always read through state: reset() replaces this grid, and a captured
    // reference would keep eating from the previous round's board.
    pelletsGrid: collectPelletsGrid(),
    pelletsRemaining: countPellets(),
    powerTicksRemaining: 0,
    lives: 3,
    score: 0,
    status: 'ready', // ready | playing | paused | respawning | won | gameover
    controlMode: 'human', // human | jev
    junctionId: null,
    lastDecision: null,
    listeners: new Set(),
  }
  const collisionState = createCollisionState()

  function emit(event) {
    for (const listener of state.listeners) listener(event)
  }

  function subscribe(listener) {
    state.listeners.add(listener)
    return () => state.listeners.delete(listener)
  }

  function setQueuedDirection(direction) {
    state.pac.queuedDirection = direction
  }

  function setControlMode(mode) {
    state.controlMode = mode
    emit({ type: 'controlModeChanged', mode })
  }

  function start() {
    if (state.status === 'ready' || state.status === 'paused') {
      state.status = 'playing'
      emit({ type: 'statusChanged', status: state.status })
    }
  }

  function pause() {
    if (state.status === 'playing') {
      state.status = 'paused'
      emit({ type: 'statusChanged', status: state.status })
    }
  }

  function reset() {
    state.tick = 0
    state.pac = createPacRunner()
    state.ghosts = createGhosts()
    state.pelletsGrid = collectPelletsGrid()
    state.pelletsRemaining = countPellets()
    state.powerTicksRemaining = 0
    state.lives = 3
    state.score = 0
    state.status = 'ready'
    state.junctionId = null
    state.lastDecision = null
    collisionState.ghostEatChainIndex = 0
    emit({ type: 'reset' })
  }

  function tileTypeAt(x, y) {
    const row = state.pelletsGrid[y]
    return row ? row[x] : undefined
  }

  function consumeTileAt(x, y) {
    const row = state.pelletsGrid[y]
    if (!row) return
    const cell = row[x]
    if (cell === '.') {
      row[x] = ' '
      eatPellet(state)
      emit({ type: 'pelletEaten', x, y })
      if (state.status === 'won') emit({ type: 'statusChanged', status: state.status })
    } else if (cell === 'o') {
      row[x] = ' '
      eatPowerPellet(state, collisionState, state.ghosts, FRIGHTENED_TICKS)
      emit({ type: 'powerPelletEaten', x, y })
      if (state.status === 'won') emit({ type: 'statusChanged', status: state.status })
    }
  }

  function tryTurn(entity, direction, { isGhost }) {
    if (!direction) return false
    const legal = legalDirections(entity.x, entity.y, { isGhost })
    if (!legal.includes(direction)) return false
    entity.direction = direction
    return true
  }

  function moveEntity(entity, { isGhost }) {
    // Turns only commit at tile centres (progress === 0).
    if (entity.progress === 0 && entity.queuedDirection) {
      if (tryTurn(entity, entity.queuedDirection, { isGhost })) {
        entity.queuedDirection = null
      }
    }

    const { dx, dy } = directionDelta(entity.direction)
    const legalHere = legalDirections(entity.x, entity.y, { isGhost })
    if (!legalHere.includes(entity.direction)) {
      // Can't advance; stay put (progress stays at 0).
      return
    }

    entity.progress += entity.speed * speedScale(state.controlMode)
    if (entity.progress >= 1) {
      entity.progress = 0
      entity.x = wrapX(entity.x + dx)
      entity.y = entity.y + dy
    }
  }

  function updatePacRunner() {
    const pac = state.pac
    const wasAtTileCentre = pac.progress === 0
    moveEntity(pac, { isGhost: false })

    if (pac.progress === 0 && wasAtTileCentre === false) {
      // just arrived at a new tile centre
      onPacArrivedAtTile()
    }

    // Jev decides at each junction -- including one Pac-Runner is already
    // sitting at (e.g. control mode just switched, or a stale/illegal
    // queued direction is stuck), not only on the arrival transition. Once
    // the decision lands, pac starts moving and progress leaves 0, so this
    // doesn't re-fire every tick.
    if (pac.progress === 0 && state.controlMode === 'jev') {
      maybeDecideAtJunction()
    }
  }

  function onPacArrivedAtTile() {
    const pac = state.pac
    consumeTileAt(pac.x, pac.y)

    for (const ghost of state.ghosts) {
      if (ghost.x === pac.x && ghost.y === pac.y) {
        handleGhostContact(ghost)
      }
    }
  }

  function maybeDecideAtJunction() {
    const pac = state.pac
    if (!isJunction(pac.x, pac.y)) return
    const snapshot = buildSnapshot(state)
    const decision = decisionProvider.decide(snapshot)
    state.lastDecision = decision
    emit({ type: 'decision', decision, junctionId: state.junctionId })
    if (decision.move && decision.move !== 'STAY') {
      setQueuedDirection(decision.move)
    }
  }

  function handleGhostContact(ghost) {
    const result = checkGhostCollision(state, collisionState, ghost)
    if (result === 'eaten') {
      emit({ type: 'ghostEaten', ghost: ghost.name })
    } else if (result === 'died') {
      emit({ type: 'lifeLost', lives: state.lives })
      if (state.status === 'gameover') {
        emit({ type: 'statusChanged', status: state.status })
      } else {
        respawn()
      }
    }
  }

  function respawn() {
    const spawn = createPacRunner()
    state.pac.x = spawn.x
    state.pac.y = spawn.y
    state.pac.direction = spawn.direction
    state.pac.queuedDirection = null
    state.pac.progress = 0
    for (const ghost of state.ghosts) {
      const def = maze.ghosts.find((g) => g.name === ghost.name)
      ghost.x = def.spawn.x
      ghost.y = def.spawn.y
      ghost.mode = def.releaseTicks > 0 ? 'house' : 'scatter'
      ghost.progress = 0
      ghost.frightenedTicksRemaining = 0
    }
    state.status = 'playing'
  }

  function updateGhostMode(ghost) {
    if (ghost.mode === 'house') {
      if (state.tick >= ghost.releaseTicks) ghost.mode = 'scatter'
      return
    }
    if (ghost.mode === 'frightened') {
      ghost.frightenedTicksRemaining -= 1
      if (ghost.frightenedTicksRemaining <= 0) {
        ghost.mode = phaseAtTick(state.tick)
      }
      return
    }
    if (ghost.mode === 'eaten') {
      if (ghost.x === maze.ghostHouse.center.x && ghost.y === maze.ghostHouse.center.y) {
        ghost.mode = phaseAtTick(state.tick)
      }
      return
    }
    // scatter/chase follow the global phase timer
    const phase = phaseAtTick(state.tick)
    if (phase !== ghost.mode) ghost.mode = phase
  }

  function ghostTarget(ghost) {
    const blinky = state.ghosts.find((g) => g.name === 'blinky')
    switch (ghost.mode) {
      case 'scatter':
        return ghost.scatterTarget
      case 'chase':
        return getChaseTarget(ghost.name, {
          pac: state.pac,
          blinky,
          clyde: ghost,
          scatterTarget: ghost.scatterTarget,
        })
      case 'eaten':
        return maze.ghostHouse.center
      case 'house':
        return maze.ghostHouse.exit
      default:
        return ghost.scatterTarget
    }
  }

  function updateGhost(ghost) {
    updateGhostMode(ghost)

    if (ghost.progress === 0 && isGhostAtJunction(ghost)) {
      const legal = ghostLegalDirections(ghost)
      const target = ghostTarget(ghost)
      const direction =
        ghost.mode === 'frightened'
          ? chooseFrightenedDirection(ghost, legal)
          : chooseDirection(ghost, target, legal, { allowReverse: ghost.mode === 'eaten' })
      ghost.direction = direction
    } else if (ghost.progress === 0) {
      const legal = ghostLegalDirections(ghost)
      if (!legal.includes(ghost.direction)) {
        const target = ghostTarget(ghost)
        ghost.direction = chooseDirection(ghost, target, legal, { allowReverse: true })
      }
    }

    const base = ghost.speed * speedScale(state.controlMode)
    const speed = ghost.mode === 'frightened' ? base * 0.6 : base
    const legalHere = legalDirections(ghost.x, ghost.y, { isGhost: true })
    if (legalHere.includes(ghost.direction)) {
      ghost.progress += speed
      if (ghost.progress >= 1) {
        ghost.progress = 0
        const { dx, dy } = directionDelta(ghost.direction)
        ghost.x = wrapX(ghost.x + dx)
        ghost.y = ghost.y + dy
      }
    }
  }

  function checkContactsMidTile() {
    // Pixel-accurate contact between tile centres, using interpolated position.
    const pac = interpolatedPosition(state.pac)
    for (const ghost of state.ghosts) {
      if (ghost.mode === 'house') continue
      const gpos = interpolatedPosition(ghost)
      const dist = Math.hypot(pac.x - gpos.x, pac.y - gpos.y)
      if (dist < 0.5) handleGhostContact(ghost)
    }
  }

  function tickOnce() {
    if (state.status !== 'playing') return

    if (state.controlMode === 'jev' && !state.pac.queuedDirection) {
      // corridor pre-fetch happens in Phase 4's scheduler; the stub provider
      // decides synchronously at the junction instead (see onPacArrivedAtTile).
    }

    updatePacRunner()
    for (const ghost of state.ghosts) updateGhost(ghost)
    checkContactsMidTile()

    const upcoming = findUpcomingJunction(state.pac.x, state.pac.y, state.pac.direction)
    state.junctionId = `${upcoming.x},${upcoming.y}`

    if (state.powerTicksRemaining > 0) {
      state.powerTicksRemaining -= 1
    }

    state.tick += 1
    emit({ type: 'tick', tick: state.tick })
  }

  function interpolatedPosition(entity) {
    const { dx, dy } = directionDelta(entity.direction)
    return { x: entity.x + dx * entity.progress, y: entity.y + dy * entity.progress }
  }

  function getSnapshot() {
    return buildSnapshot(state)
  }

  function getRenderState() {
    return {
      status: state.status,
      controlMode: state.controlMode,
      score: state.score,
      lives: state.lives,
      pelletsRemaining: state.pelletsRemaining,
      pelletsGrid: state.pelletsGrid,
      powerTicksRemaining: state.powerTicksRemaining,
      pac: { ...state.pac, ...interpolatedPosition(state.pac) },
      ghosts: state.ghosts.map((g) => ({ ...g, ...interpolatedPosition(g) })),
      lastDecision: state.lastDecision,
    }
  }

  return {
    state,
    subscribe,
    setQueuedDirection,
    setControlMode,
    start,
    pause,
    reset,
    tickOnce,
    getSnapshot,
    getRenderState,
    findUpcomingJunction,
    tileTypeAt,
  }
}
