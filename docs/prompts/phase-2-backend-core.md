# Phase 2 — Backend core, stub only

Paste into a fresh Claude Code session at the repo root.

---

Work in `/Users/saketmunda/Work/Startup/projects/pacman-runner`. Read `plan.md` first,
then load the `jev-game-backend` skill. Load `jev-integration-and-testing` only if you
touch the question/state payload — you should not in this phase.

Implement **Phase 2 only: backend core in stub mode.** No network calls, no `jev_client.py`,
no `questions.py`, no frontend. `JEV_MODE=live` may exist in config as an enum value but
must not have an implementation yet.

Build, in this order:

1. `backend/pyproject.toml` — fastapi, uvicorn[standard], httpx, pydantic-settings, and
   dev extras pytest, pytest-asyncio, respx, ruff. Create `backend/.venv` and install.
2. `backend/app/config.py` — pydantic-settings `Settings` reading `backend/.env`:
   `OPENROUTER_API_KEY` (optional), `OPENROUTER_BASE_URL`, `JEV_MODEL`,
   `JEV_TIMEOUT_SECONDS`, `JEV_MODE` (`stub`|`live`, default `stub`),
   `JEV_LOG_DECISIONS`, `CORS_ORIGINS`. See `backend/.env.example` for the exact names.
   Fail fast at startup if `JEV_MODE=live` and no key is set.
3. `backend/app/models.py` — `GameStateIn` / `JevMoveOut`, both with
   `alias_generator=to_camel, populate_by_name=True`. Field lists are in
   `.claude/skills/jev-game-backend/references/backend-layout.md` — follow them exactly.
4. `backend/app/maze.py` — load `shared/maze.json` once at import. Expose `legal_moves()`,
   `bfs_distances()` (tunnel-aware, row 14 wraps), `is_dead_end()`. Walkable is `.` and `o`
   only — `X` is void, `-` is the ghost door.
5. `backend/app/features.py` — snapshot -> compact derived state, organised by direction.
   Per-direction: `pelletDistance`, `pelletsWithin8`, `deadEnd`, `nearestGhost`. Plus the
   top-level scalars. Never include the grid. `options` keys and the eventual `move`
   criteria keys must come from one source here.
6. `backend/app/stub.py` — deterministic greedy policy: nearest pellet minus a
   ghost-proximity penalty, inverted under power mode. Emit a plausible normalised
   distribution and an aggression float, not a one-hot. Same input must always give the
   same output.
7. `backend/app/api/v1/routes.py` + `backend/app/main.py` — `POST /api/v1/jev-move`,
   `GET /api/v1/health`, CORS from settings, stub path wired.

Tests (`backend/tests/`): `test_maze.py` (BFS through the tunnel is shorter than around;
dead-end detection), `test_features.py` (shape, legal directions only, payload stays under
~400 tokens), `test_decide_stub.py` (determinism over repeated calls), `test_api.py`
(TestClient round-trip, camelCase out).

Honour the 8-rung degradation ladder in
`.claude/skills/jev-game-backend/references/error-handling.md` — in particular,
`/api/v1/jev-move` returns 200 for anything it can parse.

Verify before reporting done:
- `cd backend && .venv/bin/python -m pytest` green
- `.venv/bin/ruff check .` clean
- `python scripts/verify_maze.py` still passes
- `uvicorn app.main:app` + a `curl` of a hand-built snapshot returning `"source": "stub"` —
  paste the actual response

Then commit (`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`) and stop. Do not start
Phase 3. Report anything in the skills or `backend-layout.md` that turned out to be wrong or
underspecified so I can fix the skill before the next phase.
