---
name: jev-game-frontend
description: Conventions for the Jev Pac-Runner React frontend. Load when editing anything under frontend/ — the game loop and canvas rendering, ghost AI, the Jev telemetry panel, HUD, or styling. Covers the engine-outside-React rule, the prefetch/fallback decision flow, and the dark bento UI system.
---

# Jev Pac-Runner — frontend

React + Vite + Tailwind (whatever versions `npm create vite` and Tailwind v4's
`@tailwindcss/vite` plugin install; tokens are mapped with `@theme`), ES modules throughout. Dev server proxies `/api` to
`localhost:8000` (see `vite.config.js`), so fetches are same-origin relative paths.

## The one structural rule

**The game engine is not React state.** `src/game/` is plain, framework-free JS operating
on a mutable engine object held in a ref, stepped by `requestAnimationFrame` and drawn to a
canvas. React never re-renders per frame.

The panel subscribes to engine events and re-renders at most ~10Hz. Putting Pac-Runner's
position into `useState` re-renders the tree 60 times a second and will drop frames on the
first ghost — this is the mistake to avoid, not a micro-optimization.

```
src/game/    pure logic, no imports from react   <- vitest-tested, deterministic
src/ai/      decision scheduling + fetch          <- no React either
src/hooks/   the bridge: refs, rAF, subscriptions
src/components/  render only
```

## Game loop

Fixed-timestep accumulator, not raw delta. Movement is tile-based: entities hold a tile
coordinate plus a 0–1 progress toward the next tile, and turns are only committed at tile
centres. Interpolate for drawing only. Variable-step movement desyncs Pac-Runner from the
grid and makes pellet collision flaky.

## The decision flow — prefetch, never block

The network is never in the critical path of a frame.

1. When Pac-Runner **enters the corridor leading to** a junction, `decisionScheduler.js`
   fires the request tagged with that `junctionId`. Not on arrival — this buys a whole
   corridor traversal of latency headroom.
2. On arrival: a resolved decision for *this* `junctionId` → apply it.
3. Otherwise → `fallbackPolicy.js` picks locally, panel shows a `FALLBACK` badge.
4. A reply for a junction already passed is **discarded**, never applied late.
5. `AbortController` deadline ≈ estimated time-to-junction.

The fallback is a real greedy policy (nearest pellet by BFS, ghost-proximity penalty,
inverted under power mode), not a random direction — the game stays watchable with the
backend down.

## Components

`GameCanvas` (canvas + rAF) · `JevPanel` (bento shell) · `ProbabilityBars` ·
`AggressionMeter` · `DecisionLog` (last 8) · `HUD` (score/lives) · `ControlBar`
(human ↔ Jev toggle) · `Onboarding` · `ErrorBanner`.

The maze is primary and left; the panel is secondary, right, and always visible. The panel
is the *point of the demo* — it is what makes an invisible capability legible — so it never
collapses or hides behind a tab.

## Gotchas

- **`moveProbabilities` has a variable key set.** Only legal directions come back, so the
  bar chart must render whatever keys arrive. Never assume four bars or a fixed order; sort
  by probability descending and key by direction.
- **`aggressionScore` is a float, not an int.** Jev returns a probability-weighted mean, so
  2.4 is normal and meaningful. Don't round it away — the fractional part is the signal.
- **A prefetched snapshot is projected to the junction.** The backend derives legal moves
  from `position`, so a request fired mid-corridor must send `position` = the junction tile
  (`junctionId`), not Pac-Runner's current tile — otherwise the only legal moves are
  forward/back and Jev answers the wrong question. Ghosts stay as observed now.
  `eatenPellets` is projected too: the corridor pellets Pac-Runner will eat on the way
  count as eaten, or Jev is told the corridor it is leaving still has food one tile back.
  Re-check the returned move against `legalDirections(junction)` before applying it.
- **Every pellet read goes through `state.pelletsGrid`.** `reset()` replaces that grid; a
  captured reference keeps eating from the previous round's board (a Phase 6 bug).
- **Read the `source` field and show it.** `jev` / `stub` / `fallback` must be visually
  distinct. Never present a fallback move as a Jev decision.
- **Animate probability bars with a transition on width**, not by re-mounting. Re-mounting
  restarts the animation every tick and reads as flicker.
- **Canvas must be sized in device pixels** (`width = cssWidth * devicePixelRatio`) or the
  maze is blurry on retina — the default this project will be demoed on.
- Keyboard handlers go on `window` with `preventDefault` for arrows, or the page scrolls
  under the game. Remove them on unmount.
- Tunnel wrap on row 14 needs rendering care: draw the entity at both edges mid-wrap or it
  visibly teleports.

## Verify

```bash
cd frontend && npm run dev     # with backend on :8000
npm run lint
npm test                       # vitest, covers src/game and src/ai only
```

Manual checks that matter: keyboard playthrough clears pellets; ghosts behave distinctly;
60fps in devtools with the panel live; **kill the backend mid-run** → banner appears, game
keeps playing on fallback.

See `references/ui-system.md` for palette, bento layout and motion rules.
