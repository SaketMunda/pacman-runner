# Phase 4 — Wire frontend to backend

Paste everything below the line into a fresh session at the repo root.

---

Work in /Users/saketmunda/Work/Startup/projects/pacman-runner. Read plan.md first, then
load the `jev-game-frontend` skill and read its references/ui-system.md. Phases 2
(backend, stub mode) and 3 (playable frontend) are done and committed. Do not modify
backend/ in this phase; if you believe the backend contract is wrong, stop and report
rather than changing it.

Implement Phase 4 only: Jev mode drives Pac-Runner via the backend (stub mode), with a
live telemetry panel and a local fallback. No live OpenRouter calls, no questions.py or
jev_client.py. Those are Phase 5.

## What already exists — read these before writing anything

- frontend/src/game/loop.js: the engine. In Jev mode, `maybeDecideAtJunction()` calls
  `decisionProvider.decide(snapshot)` **synchronously** when Pac-Runner sits on a junction
  tile, and it emits `{type:'decision', decision, junctionId}`. `state.junctionId` is
  recomputed every tick as `"x,y"` of the junction Pac-Runner is heading toward.
- frontend/src/game/decisionProvider.js: the hard-coded provider, `decide → {move, source}`.
- frontend/src/game/snapshot.js: `buildSnapshot(state)` → the GameStateIn shape.
- backend/app/models.py (`GameStateIn`, `JevMoveOut`) and backend/app/features.py.
  **The backend derives legal moves from `position`.**

`decide()` stays synchronous. Never make the engine await anything. The network lives
entirely in the scheduler, ahead of time.

## Build, in this order

1. **src/ai/fallbackPolicy.js**: a greedy policy with no React and no network. It uses BFS
   (tunnel-aware, reusing game/maze.js) to score each legal direction at a junction by
   nearest pellet minus a ghost-proximity penalty, inverted for frightened ghosts while
   powered. It returns `{move, moveProbabilities, source:'fallback'}`, where the
   probabilities are a softmax over the scores, so the panel always has bars to draw. It must
   be deterministic, never pick an illegal move, and never choose reverse unless it is the
   only option.
2. **src/ai/jevClient.js**: `fetchDecision(snapshot, {signal}) → JevMoveOut` using POST
   `/api/v1/jev-move`, relative path through the Vite proxy. It classifies failures:
   network error or 5xx → `backend-down`, abort → `timeout`, bad JSON or shape →
   `bad-response`. Do not throw generic errors upward.
3. **src/ai/decisionScheduler.js**: exposes an object with a synchronous `decide(snapshot)`
   (the engine's provider) plus an `onTick(state)` the engine or hook calls every tick.
   - **Prefetch trigger:** when `state.junctionId` changes to a new junction, abort any
     in-flight request and fire one for the new junction. Keep exactly one pending slot,
     tagged with `junctionId` and a monotonically increasing request seq.
   - **Projection (critical):** the prefetch snapshot's `position` is the **junction tile**
     parsed from `junctionId`, not Pac-Runner's current tile. The backend computes legal
     moves from `position`. Direction, ghosts and everything else come from `state` as
     it is now.
   - **Deadline:** an `AbortController` with a timeout of about ticks-to-junction ÷ TICK_HZ,
     with a small floor and a ceiling of around 1s.
   - **On arrival (`decide`):** if the slot holds a resolved reply for this `junctionId`
     and its move is in `legalDirections(junction)`, apply it with the source the backend
     sent. Otherwise use `fallbackPolicy` and mark the reason (`timeout`, `pending`,
     `illegal-move`, `backend-down`). Consume the slot after use. A junction revisited
     later must never reuse an old reply.
   - **Stale replies:** a reply whose seq isn't the current one is dropped, never applied.
   - **Reset:** on `reset` and `lifeLost` engine events, abort and clear everything.
   - Track counters (`requests`, `hits`, `fallbacks` by reason, rolling latency) for the
     panel.
4. **src/hooks/useJevDecisions.js**: creates the scheduler once, hands it to
   `useGameEngine` as the `decisionProvider`, subscribes to engine `decision` events, and
   exposes panel state throttled to ≤10Hz. It must not re-render per frame.
5. **src/components/JevPanel.jsx** replaces the placeholder in App.jsx. Build the bento
   cards per ui-system.md:
   - `ProbabilityBars`: renders whatever keys arrive, sorted descending, keyed by
     direction, with a width transition and no re-mounting.
   - `AggressionMeter`: 0–4, shows the float as-is (2.4, not 2), with the level label.
   - Current decision card: move, confidence and a source badge. `jev`, `stub` and
     `fallback` must each be visually distinct, and a fallback shows its reason.
   - `DecisionLog`: the last 8 decisions — junction, move, source, latency.
   - A small stats line: hit rate and median latency.
   - The existing `decision` event carries only `{move, source}` from the provider. Extend
     the scheduler's return so the panel gets the probabilities, aggression, confidence,
     latency and reason. The engine keeps ignoring everything but `move`.
6. **src/components/ErrorBanner.jsx + Onboarding.jsx**
   - ErrorBanner appears after 3 consecutive `backend-down` failures. Jev mode keeps
     running on the fallback. The banner offers "Switch to human control" and clears
     itself when a request succeeds again. Don't auto-switch to human control.
   - Onboarding: one dismissible sentence explaining that Jev picks each turn and the
     panel shows how sure it was. The dismissal is remembered in localStorage inside
     try/catch.

## Tests (vitest, src/ai only; mock fetch, no running backend)

- fallbackPolicy.test.js: legal-only, determinism, probabilities sum≈1, flees a
  chasing ghost, chases a frightened one.
- decisionScheduler.test.js:
  - Projection: the posted snapshot's position equals the junction tile.
  - A resolved reply is applied.
  - A late reply for a passed junction is discarded.
  - A revisited junction never reuses an old reply.
  - An illegal move falls back.
  - Timeout falls back with reason `timeout`.
  - Reset clears the pending slot.
- jevClient.test.js: each failure classification.

## Verify before reporting done

- `npm test` green, `npm run lint` clean, `npm run build` succeeds. Backend
  `.venv/bin/python -m pytest` is still green.
- With both servers running (backend `JEV_MODE=stub`), in Jev mode:
  - Pac-Runner clears pellets on its own.
  - The bars and aggression meter update at each junction.
  - Most decisions show `stub` rather than `fallback`.
  - Report the observed hit rate and median latency.
- Kill the backend mid-run. The banner appears, the game keeps playing and the badges
  switch to `fallback`. Restart the backend and the banner clears.
- Performance: steady ~60fps with the panel live, and no per-frame React re-renders.
- Say which checks you did in a real browser and which you couldn't. Don't claim a
  visual check you didn't do.

Then commit, ending the message with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, and stop. Do not start Phase 5.
Report the measured hit rate and latency, and anything in the jev-game-frontend skill that
turned out wrong or underspecified.
