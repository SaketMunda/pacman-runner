import { useEffect, useRef } from 'react'
import { FRIGHTENED_FLASH_TICKS } from '../game/ghosts.js'
import { maze, width as mazeWidth, height as mazeHeight } from '../game/maze.js'
import { TICK_MS } from '../game/loop.js'

const TILE = 20
const WALL_COLOR = getCssVar('--maze-wall', '#2540ff')
const PELLET_COLOR = getCssVar('--pellet', '#ffd9a0')
const POWER_COLOR = getCssVar('--power', '#ffe66d')
const PAC_COLOR = getCssVar('--pac', '#ffe600')
const FRIGHTENED_COLOR = '#1b3bff'
const EYES_COLOR = '#e8e8f5'

function getCssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  return value?.trim() || fallback
}

function drawWalls(ctx) {
  ctx.fillStyle = WALL_COLOR
  for (let y = 0; y < mazeHeight; y++) {
    const row = maze.grid[y]
    for (let x = 0; x < mazeWidth; x++) {
      if (row[x] === '#') {
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE)
      }
      // 'X' (void) is intentionally never drawn.
    }
  }
}

function drawPellets(ctx, pelletsGrid, blinkOn) {
  for (let y = 0; y < mazeHeight; y++) {
    const row = pelletsGrid[y]
    for (let x = 0; x < mazeWidth; x++) {
      const cell = row[x]
      if (cell === '.') {
        ctx.fillStyle = PELLET_COLOR
        ctx.beginPath()
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (cell === 'o' && blinkOn) {
        ctx.fillStyle = POWER_COLOR
        ctx.beginPath()
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

function drawAtBothEdges(x, y, draw) {
  draw(x, y)
  if (x < 0) draw(x + mazeWidth, y)
  else if (x > mazeWidth - 1) draw(x - mazeWidth, y)
}

function drawPac(ctx, pac) {
  drawAtBothEdges(pac.x, pac.y, (x, y) => {
    ctx.fillStyle = PAC_COLOR
    ctx.beginPath()
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE / 2 - 2, 0.25 * Math.PI, 1.75 * Math.PI)
    ctx.lineTo(x * TILE + TILE / 2, y * TILE + TILE / 2)
    ctx.closePath()
    ctx.fill()
  })
}

function drawGhost(ctx, ghost, tick) {
  const flashing =
    ghost.mode === 'frightened' && ghost.frightenedTicksRemaining <= FRIGHTENED_FLASH_TICKS
  const isEaten = ghost.mode === 'eaten'
  const bodyColor =
    ghost.mode === 'frightened'
      ? flashing && tick % 20 < 10
        ? '#ffffff'
        : FRIGHTENED_COLOR
      : ghost.color

  drawAtBothEdges(ghost.x, ghost.y, (x, y) => {
    const cx = x * TILE + TILE / 2
    const cy = y * TILE + TILE / 2
    if (!isEaten) {
      ctx.fillStyle = bodyColor
      ctx.beginPath()
      ctx.arc(cx, cy, TILE / 2 - 2, Math.PI, 0)
      ctx.lineTo(cx + TILE / 2 - 2, cy + TILE / 2 - 2)
      ctx.lineTo(cx - TILE / 2 + 2, cy + TILE / 2 - 2)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = EYES_COLOR
    ctx.beginPath()
    ctx.arc(cx - 3, cy - 2, 2, 0, Math.PI * 2)
    ctx.arc(cx + 3, cy - 2, 2, 0, Math.PI * 2)
    ctx.fill()
  })
}

export function GameCanvas({ engineRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const cssWidth = mazeWidth * TILE
    const cssHeight = mazeHeight * TILE
    canvas.width = cssWidth * dpr
    canvas.height = cssHeight * dpr
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let rafId
    let accumulator = 0
    let lastTime = performance.now()
    let lastAriaUpdate = 0

    function frame(now) {
      const engine = engineRef.current
      const delta = now - lastTime
      lastTime = now
      accumulator += delta

      while (accumulator >= TICK_MS) {
        engine.tickOnce()
        accumulator -= TICK_MS
      }

      const renderState = engine.getRenderState()
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      drawWalls(ctx)
      drawPellets(ctx, renderState.pelletsGrid, Math.floor(now / 250) % 2 === 0)
      drawPac(ctx, renderState.pac)
      for (const ghost of renderState.ghosts) drawGhost(ctx, ghost, engine.state.tick)

      if (now - lastAriaUpdate > 1000) {
        lastAriaUpdate = now
        canvas.setAttribute(
          'aria-label',
          `Jev Pac-Runner. Score ${renderState.score}. Lives ${renderState.lives}. ` +
            `Move ${renderState.pac.direction}. ${renderState.pelletsRemaining} pellets remaining.`,
        )
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [engineRef])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Jev Pac-Runner maze"
      className="rounded-2xl border border-border bg-bg"
    />
  )
}
