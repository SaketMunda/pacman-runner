# Jev Pac-Runner — Implementation Plan

## Context

Build a browser Pac-Man-style demo, **Jev Pac-Runner**, where a decision-only AI picks the player's turns in real time. The project directory is currently empty — this is a greenfield build. Python 3.13 and Node 24 are already installed.

The point of the demo is to make an *invisible* capability visible: Jev returns a calibrated probability distribution over moves, and the UI renders that distribution live next to the maze. So the telemetry panel is not decoration — it is the product.

### Research finding that shapes the design

Jev is **not** a chat-completions model. It is served through OpenRouter's alpha **Decisions API**, a different endpoint with a different wire format:

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
```

```json
{
  "model": "~typesafe/jev-latest",
  "state": { "any": "string, object, or array" },
  "questions": {
    "queue": { "type": "choice", "instructions": "...",
               "criteria": { "billing": "rubric text", "technical": "rubric text" } },
    "angry": { "type": "noul", "instructions": "..." }
  }
}
```

Response envelope: `{ "id": "gen-dec-…", "model", "provider", "usage": {input_tokens, output_tokens, cost}, "answers": { … } }` where each answer is typed:

- `noul` → `{ "type": "noul", "noul": 0.98 }` (probability of yes)
- `choice` → `{ "type": "choice", "choice": "billing", "probabilities": {…sums to 1}, "confidence": 0.80 }`
- `score` → `{ "type": "score", "score": 1.05, "legend": {"0":"Calm",…}, "probabilities": {…}, "confidence": 0.92 }`

Key properties: `criteria` is **required** for choice (map of option → rubric) and score (ordered level list). Score is a probability-weighted mean, so it lands between integers. Context window 32k; input $0.042/1M, output free. No text generation, no streaming.

Two consequences worth calling out up front:

1. **Illegal moves are prevented structurally.** We build the `choice` criteria from only the directions that aren't walls at this junction, so Jev cannot pick into a wall. We still validate on return.
2. **`confidence` and the full distribution come free.** No prompt engineering needed to extract them, which is exactly what the telemetry panel wants.

Publicly documented latency is unavailable, so the architecture must not assume it — see Prefetch below.

### Confirmed decisions

| Decision | Choice |
|---|---|
| Frontend | React + Vite + Tailwind |
| Backend | FastAPI (async, native pydantic validation, matches the async HTTP call) |
| Ghost AI | Classic arcade personalities + scatter/chase/frightened phases |
| Latency | Non-blocking, prefetched, local fallback on deadline miss |
| API key | User supplies in `backend/.env`; stub mode built first |

---

## Architecture

### The maze lives in `shared/maze.json`, loaded by both sides

This is the central structural decision. The frontend owns rendering and the game loop; the backend owns *feature extraction*. If the backend already knows the maze, the frontend never has to ship it — each request carries only dynamic state (~15 fields), and all the interesting derived logic (BFS distances, corridor lookahead, dead-end detection) lives in Python where pytest can cover it.

```
Frontend                      Backend                        Jev
game tick ──► junction        /api/v1/jev-move
              snapshot ──────► features.py (BFS on maze) ──► state
              (~15 fields)     questions.py (v1 schema)  ──► questions
                               jev_client.py ─────────────► POST /alpha/decisions
              decision ◄────── decide.py (validate) ◄────── answers
```

### Prefetch, don't block

The game must never stall on the network. The scheduler fires the request **when Pac-Runner enters the corridor leading to a junction**, not on arrival — buying a full corridor traversal of headroom.

- Each request is tagged with the target `junctionId`.
- On arrival: resolved decision for this junction → use it. Otherwise → local fallback heuristic, panel shows a `FALLBACK` badge.
- A reply arriving after its junction is passed is **discarded** (stale `junctionId`), never applied late.
- `AbortController` deadline = estimated time-to-junction.

The fallback is a greedy BFS policy in `ai/fallbackPolicy.js`: nearest pellet, minus ghost-proximity penalty, invert when powered. It also keeps the game fully playable with the backend down.

### Jev question schema v1 (stable — document changes, version bumps)

```
move:       choice, criteria = { <only legal directions> : rubric }
aggression: score,  criteria = [Flee, Cautious, Neutral, Hunting, Reckless]   # 0–4
```

`STAY` is included in the move enum as specified, mapped to "hold current heading". It's rarely useful in Pac-Man; documented as such rather than silently dropped.

### API contract

`POST /api/v1/jev-move` → camelCase JSON:

```json
{ "move": "LEFT", "moveProbabilities": {"LEFT":0.71,"UP":0.22,"DOWN":0.07},
  "aggressionScore": 2.4, "confidence": 0.68,
  "source": "jev", "latencyMs": 180, "decisionId": "gen-dec-…" }
```

`source` is one of `jev` | `stub` | `fallback` — the panel renders it, so the demo is always honest about who moved.

`GET /api/v1/health` for debugging.

---

## Layout

```
backend/app/    main.py  config.py  models.py  maze.py  features.py
                questions.py  jev_client.py  decide.py  stub.py
                api/v1/routes.py
backend/tests/  test_features.py  test_questions.py  test_decide_stub.py
                test_jev_client_mocked.py  test_api.py
frontend/src/   game/{maze,entities,ghosts,loop,collision}.js      # pure, no React
                ai/{jevClient,fallbackPolicy,decisionScheduler}.js
                hooks/{useGameEngine,useJevDecisions}.js
                components/{GameCanvas,JevPanel,ProbabilityBars,
                            AggressionMeter,DecisionLog,HUD,
                            ControlBar,Onboarding,ErrorBanner}.jsx
shared/maze.json      docs/jev-examples.md      plan.md
.claude/skills/{jev-game-backend,jev-game-frontend,jev-integration-and-testing}/
```

---

## Phases

Task sizes are 5–10 minute chunks.

### Phase 0 — Scaffold (~20 min)
1. Create tree, `.gitignore`, `.env.example`, `git init`.
2. Author `shared/maze.json` (classic 28×31 grid, tunnels, 4 power pellets).
3. Copy this plan to `plan.md` for in-repo tracking.

**Verify:** `python -c "import json;json.load(open('shared/maze.json'))"`; grid row widths uniform.

### Phase 1 — Claude skills (~30 min)
Written before code so implementation follows them.

4. `.claude/skills/jev-game-backend/` — SKILL.md (when-to-load, FastAPI conventions, kebab-case versioned paths + camelCase JSON, config/test placement) + `references/openrouter-decisions.md` (the wire format above) + gotchas: Jev timeouts, payload size, CORS for the Vite origin.
5. `.claude/skills/jev-game-frontend/` — SKILL.md (React/Vite/Tailwind, engine-outside-React rule, component map) + `references/ui-system.md` (dark palette tokens, bento grid, motion rules) + gotchas: render-loop perf, never block on Jev, fallback states.
6. `.claude/skills/jev-integration-and-testing/` — SKILL.md (state/question construction, token economy) + `references/question-schema-v1.md` + `examples/` request/response pairs + gotchas: schema versioning, validating distributions sum≈1 and score ∈ [0,4].

**Verify:** each SKILL.md has valid frontmatter, description states *when* to load, body stays under ~100 lines with detail pushed to `references/`.

### Phase 2 — Backend core, stub only (~45 min)
7. `pyproject.toml` (fastapi, uvicorn, httpx, pydantic-settings, pytest, pytest-asyncio, respx, ruff); venv + install.
8. `config.py` — `OPENROUTER_API_KEY`, base URL, model slug (default `~typesafe/jev-latest`), timeout, `JEV_MODE=stub|live`.
9. `models.py` — `GameStateIn` / `JevMoveOut` with `alias_generator=to_camel, populate_by_name=True`.
10. `maze.py` — load shared maze, `legal_moves()`, `bfs_distances()`, `is_dead_end()`.
11. `features.py` — snapshot → compact Jev state (per-direction pellet distance, ghost BFS distance + mode, dead-end flag, power ticks, lives).
12. `stub.py` — deterministic greedy policy emitting a plausible distribution.
13. `routes.py` + `main.py` — endpoints, CORS, wire stub path.

**Verify:** `pytest` green on `test_features.py` / `test_decide_stub.py`; `curl` a hand-built snapshot to `/api/v1/jev-move` and get a valid `source:"stub"` response.

### Phase 3 — Frontend game, hard-coded decisions (~60 min)
14. Vite + React + Tailwind init; dark theme tokens; `/api` proxy → `:8000`.
15. `game/maze.js` + `GameCanvas` — render maze and pellets.
16. `entities.js` + `loop.js` — tile-based movement, fixed-timestep accumulator, keyboard control.
17. `ghosts.js` — Blinky/Pinky/Inky/Clyde targeting + scatter/chase/frightened timer.
18. `collision.js` — pellets, power pellets, ghost collisions, lives, score.
19. `HUD` + `ControlBar` — score, lives, human/Jev toggle, powered-by-Jev label.

**Verify:** play it by keyboard end to end — pellets clear, ghosts behave distinctly, power mode flips them, lives decrement, win/lose resolve. 60fps in devtools.

### Phase 4 — Wire frontend to backend (~40 min)
20. `fallbackPolicy.js` — local greedy heuristic.
21. `decisionScheduler.js` — prefetch on corridor entry, junctionId tagging, deadline, stale-reply discard.
22. `jevClient.js` + `useJevDecisions` — fetch, abort, error surfacing.
23. `JevPanel` bento cards — `ProbabilityBars`, `AggressionMeter`, `DecisionLog`, source badge.
24. `ErrorBanner` + `Onboarding` — backend-down banner; Jev mode keeps running on the local fallback policy and the banner offers a switch to human control; one-sentence explainer.

**Verify:** run both servers in stub mode; Jev-controlled Pac-Runner clears pellets, bars animate on each decision, no frame drops. Kill the backend mid-run → banner appears, game keeps running on fallback.

### Phase 5 — Live Jev (~30 min)
25. `questions.py` — v1 builders, legal-moves-only criteria.
26. `jev_client.py` — async httpx POST to `/api/alpha/decisions`, timeout, structured error logging.
27. `decide.py` — orchestrate + validate (move ∈ legal, probabilities sum≈1, score ∈ [0,4]); degrade to stub on any failure.
28. JSONL decision log for inspecting real behavior.
29. `test_jev_client_mocked.py` via `respx` using captured real fixtures.

**Verify:** `pytest` green. Add the key, `JEV_MODE=live`, play a round. Confirm `source:"jev"`, inspect the JSONL for sane distributions, record observed latency and tune the prefetch deadline to match.

### Phase 6 — Polish (~30 min)
30. Microinteractions: decision pulse, bar transitions, power-mode shift — state-communicating only.
31. Accessibility pass: contrast ≥ 4.5:1, focus rings, full keyboard operation, `prefers-reduced-motion`.
32. `docs/jev-examples.md` with real captured request/response pairs.
33. `README.md` — setup, both run commands, mode switching.

**Verify:** full read-through, Lighthouse a11y, fresh-clone setup following only the README.

---

## Verification summary

| Layer | Command / check |
|---|---|
| Backend | `cd backend && pytest` |
| Lint | `ruff check backend` |
| Backend live | `uvicorn app.main:app --reload` + curl `/api/v1/health` |
| Frontend | `cd frontend && npm run dev` |
| Game logic | Keyboard playthrough, stub mode |
| Integration | Jev mode playthrough + JSONL decision inspection |
| Resilience | Kill backend mid-run → fallback banner, game continues |

## Open items to confirm during implementation

- **Model slug**: the user specified `~typesafe/jev-latest`; OpenRouter's own example uses the pinned `typesafe/jev-1.13`. Made env-configurable, defaulting to the user's slug, and resolved against a real call in Phase 5.
- **Score `criteria` shape**: documented as an ordered level list; confirmed against a live response in Phase 5 before the tests are frozen.
- **Real latency** is undocumented — measured in Phase 5 and the prefetch deadline tuned to it.
