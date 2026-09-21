---
name: jev-game-backend
description: Conventions for the Jev Pac-Runner Python backend. Load when editing anything under backend/ — FastAPI routes, request/response models, maze BFS and feature extraction, the stub policy, or config. For the Jev wire format and question schema specifically, use jev-integration-and-testing instead.
---

# Jev Pac-Runner — backend

FastAPI + httpx + pydantic-settings, Python 3.13. Entry point `backend/app/main.py`.

## The one structural rule

**The backend owns the maze; the frontend owns the game loop.** Both read the same
`shared/maze.json`. The frontend therefore ships only *dynamic* state per request
(~15 fields: positions, modes, power ticks, score, lives) and never the grid.

Everything derived — BFS distances, corridor lookahead, dead-end detection, legal moves —
is computed here, in `maze.py` and `features.py`, because that is where pytest can reach it.
If you find yourself adding a derived field to the request model, it belongs in
`features.py` instead.

## API conventions

- Paths are kebab-case and versioned: `/api/v1/jev-move`, `/api/v1/health`.
- **Wire JSON is camelCase; Python is snake_case.** Never hand-write the conversion —
  every model in `models.py` inherits a base with
  `alias_generator=to_camel, populate_by_name=True`. Construct models with snake_case
  keyword args; serialize with `.model_dump(by_alias=True)`.
- Every response carries `source`: `"jev" | "stub" | "fallback"`. The UI renders it, so
  the demo is always honest about who actually chose the move. Never fake `"jev"`.

## Module boundaries

| Module | Owns | Must not |
|---|---|---|
| `config.py` | env via pydantic-settings | be read anywhere but at wiring time |
| `maze.py` | grid load, `legal_moves`, `bfs_distances` | know about Jev or HTTP |
| `features.py` | snapshot → compact Jev `state` dict | call the network |
| `questions.py` | v1 question builders | know about HTTP |
| `jev_client.py` | the HTTP call, timeout, transport errors | interpret game meaning |
| `decide.py` | orchestrate + validate + degrade | build payloads itself |
| `stub.py` | deterministic policy, no network | import httpx |

`decide.py` is the only module that knows all of them. Keep it that way — it is what makes
stub mode a one-line swap rather than a branch scattered through the codebase.

## Config

All settings come from `backend/.env` (see `.env.example`), never hard-coded. `JEV_MODE`
defaults to `stub` so a fresh clone runs with no API key. `OPENROUTER_API_KEY` is required
*only* when `JEV_MODE=live`; validate that at startup, not at request time, so the failure
is loud and early.

## Gotchas

- **Walkability is exactly `. o` (space).** `X` is off-playfield void and `-` is the ghost
  door — both are non-walkable for Pac-Runner. Use the shared predicate in `maze.py`; do
  not re-derive it. Getting this wrong lets BFS escape the maze through the padding.
- **BFS must follow the tunnel wrap** on row 14, or distances on the maze edges are wrong
  in a way that looks subtly like bad Jev judgement rather than a bug.
- **Never let a Jev failure reach the client as a 5xx.** Timeout, transport error, malformed
  answer, illegal move — all degrade to the stub policy and return 200 with
  `source: "stub"`. The game must keep running. Log the reason at WARNING.
- **The maze is loaded once at import**, not per request. It is ~1KB but BFS over it runs on
  every junction; cache distance fields keyed by target tile.
- **CORS must list the Vite origin explicitly** (`http://localhost:5173`). Wildcard origins
  break once credentials are involved and mislead in dev.
- Timeouts are a *product* setting, not a safety net: the frontend has already moved on by
  the deadline. Keep `JEV_TIMEOUT_SECONDS` tight (~1.5s) and fall back rather than stall.

## Verify

```bash
cd backend && pytest -q          # unit + mocked integration
ruff check app tests
python ../scripts/verify_maze.py # after any shared/maze.json edit
uvicorn app.main:app --reload    # then curl /api/v1/health
```

See `references/backend-layout.md` for the file tree and `references/error-handling.md` for
the degradation ladder.
