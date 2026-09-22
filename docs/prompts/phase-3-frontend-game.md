# Phase 3 — Frontend game, hard-coded decisions

Paste everything below the line into a fresh session at the repo root.

---

Work in /Users/saketmunda/Work/Startup/projects/pacman-runner. Read plan.md first, then
load the `jev-game-frontend` skill and read its references/ui-system.md. Phase 2 (backend,
stub mode) is done and committed — do not modify backend/ in this phase.

Implement Phase 3 only: a playable Pac-Man game in the browser. No network calls, no
jevClient.js, no decisionScheduler.js, no fallbackPolicy.js, no JevPanel internals. Those
are Phase 4.

## Build, in this order

1. **Scaffold** into the existing (empty) frontend/ directory: Vite + React (JS, not TS),
   Tailwind v4 via `@tailwindcss/vite`, ESLint, and vitest. Accept whatever versions the
   scaffold installs. `vite.config.js`: `/api` proxy → `http://localhost:8000`, and
   `server.fs.allow` including the repo root so `../shared/maze.json` can be imported.
   Tokens from ui-system.md go on `:root` in src/index.css, mapped via `@theme`.
2. **src/game/maze.js** — import shared/maze.json directly (never copy it). Expose
   `isWalkable(x, y, {isGhost})` (`.`, `o`, ` ` walkable; `-` only for ghosts; `#` and `X`
   never), `legalDirections(x, y)`, tunnel wrap on row 14, and `isJunction(x, y)` (≥3 exits,
   or 2 exits that aren't opposite). Phase 4's scheduler builds on `isJunction`, so get it
   right and test it.
3. **src/game/entities.js + loop.js** — fixed-timestep accumulator (define `TICK_HZ` once;
   "tick" means one simulation step everywhere, including `powerTicksRemaining`). Entities
   are tile coordinate + 0–1 progress; turns commit only at tile centres; a queued
   keyboard turn is buffered until it becomes legal. Interpolate only for drawing.
4. **src/components/GameCanvas.jsx + src/hooks/useGameEngine.js** — engine object in a
   ref, rAF loop, canvas sized in device pixels. Draw walls, pellets, power pellets (blink),
   Pac-Runner, ghosts. Draw at both edges while wrapping through the tunnel. Do not draw `X`.
5. **src/game/ghosts.js** — Blinky/Pinky/Inky/Clyde classic targeting, scatter targets
   and releaseTicks from maze.json, scatter/chase phase timer, frightened (random at each
   intersection, blue, flash near expiry), eaten (eyes return to the house). Ghosts never
   reverse except on a mode change; tie-break UP > LEFT > DOWN > RIGHT.
6. **src/game/collision.js** — pellets (10), power pellets (50 + frightened), ghost eat
   chain (200/400/800/1600), life loss with respawn, win when pellets reach 0, game over
   at 0 lives.
7. **src/components/HUD.jsx + ControlBar.jsx** — score, lives, pellets remaining,
   start/pause/restart, and a Human ↔ Jev toggle. HUD re-renders from engine events at
   ≤10Hz, never per frame.

## The two seams Phase 4 will plug into — build these now

- **Decision provider.** In Jev mode, the engine calls
  `decisionProvider.decide(snapshot) → { move, source }` at each junction. Ship only a
  trivial hard-coded provider in src/game/ (keep heading if legal, else first legal in
  UP > LEFT > DOWN > RIGHT) and return `source: "stub"`. The engine must not care which
  provider it has.
- **Snapshot.** `engine.getSnapshot()` returns exactly the camelCase shape of
  `GameStateIn` in backend/app/models.py: `mazeId, tick, position{x,y}, direction,
  junctionId, ghosts[{name, position, mode, direction}], powerTicksRemaining,
  pelletsRemaining, lives, score`. `junctionId` is `"x,y"` of the junction Pac-Runner is
  heading toward. Read models.py — do not guess field names.

Leave a placeholder right-hand card in the layout where JevPanel will go, so Phase 4 does
not have to rework the grid.

## Tests (vitest, src/game only)

maze.test.js (walkability incl. ghost door and void, tunnel wrap, `isJunction` on a known
junction, corridor and corner), ghosts.test.js (each ghost's chase target from a fixed
state, no-reverse rule), collision.test.js (scoring, eat chain resets on new power pellet,
win and game-over), snapshot.test.js (keys match GameStateIn exactly, and the payload
contains no grid).

## Verify before reporting done

- `npm test` green, `npm run lint` clean, `npm run build` succeeds
- `npm run dev` and play by keyboard: pellets clear, the four ghosts behave visibly
  differently, power mode turns them blue and they flee, eating one sends eyes home, the
  tunnel wraps cleanly, lives decrement, win and lose both resolve
- Flip to Jev mode: Pac-Runner moves on its own via the hard-coded provider, no errors
- Performance tab: steady ~60fps, and React DevTools shows no per-frame re-renders
- Say which of these you checked in a real browser and which you couldn't; do not claim
  a visual check you didn't do

Then commit (end the message with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`) and stop. Do not start Phase 4.
Report anything in the jev-game-frontend skill or ui-system.md that turned out wrong or
underspecified, and any maze.json quirks you hit.
