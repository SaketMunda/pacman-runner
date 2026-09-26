# Jev Pac-Runner

A browser Pac-Man where an AI called **Jev** picks Pac-Runner's turn at every junction,
while a panel beside the maze shows the full probability distribution behind each choice.
The point is to make an invisible capability visible: how sure the model was, and what it
almost did instead.

**Jev is not a chat model.** It is served through OpenRouter's alpha
[Decisions API](docs/jev-examples.md), and it answers typed questions:

- **Typed questions, typed answers.** A `choice` question gets back a chosen option plus a
  calibrated distribution over every option. A `score` question gets back a
  probability-weighted value on an ordered scale. There's no text to parse.
- **An illegal move is structurally impossible.** The `move` question's options are built
  from only the directions that aren't walls at this junction, so Jev can't answer "into a
  wall". Both the backend and the frontend still re-check.
- **Confidence is a field, not a prompt.** Every answer carries `confidence` and the
  full distribution. Nobody asks the model how sure it is and hopes for a parseable number.

See [docs/jev-examples.md](docs/jev-examples.md) for one real decision traced end to end.

## Setup from a fresh clone

You need **Python 3.13** and **Node 24**.

```bash
git clone https://github.com/SaketMunda/pacman-runner.git
cd pacman-runner

# backend
cd backend
python3.13 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env
cd ..

# frontend
cd frontend
npm install
cd ..
```

`backend/.env` starts in **stub mode**, which needs no key. To call Jev for real, put your
OpenRouter key in `backend/.env` as `OPENROUTER_API_KEY=` and set `JEV_MODE=live`. The file
is gitignored; never commit it.

## Run

Two terminals, from the repo root:

```bash
# 1. backend on :8000
cd backend && .venv/bin/uvicorn app.main:app --reload

# 2. frontend on :5173 (proxies /api to :8000)
cd frontend && npm run dev
```

Open <http://localhost:5173>, flip the **Human / Jev** switch to Jev, and press **Start**.
In human mode the arrow keys steer.

### `JEV_MODE`: stub or live

Set in `backend/.env`; restart the backend after changing it.

| Mode | What happens at each junction | Needs a key |
|---|---|---|
| `stub` (default) | The backend answers with a deterministic local greedy policy. **OpenRouter is never contacted.** Badges read `stub` (grey). | No |
| `live` | The backend calls Jev through OpenRouter. Badges read `jev` (teal). If Jev fails or times out, the backend answers with the stub policy and the badge honestly reads `stub`. | Yes. The backend refuses to start in `live` without one. |

The banner under the title reads `GET /api/v1/health` and says which mode you are in. In
stub mode it says plainly that Jev is not being called.

## Architecture in brief

```
Browser                                  Backend (FastAPI)                  Jev
game loop ─► corridor entry:             /api/v1/jev-move
             snapshot for the  ────────► features.py (BFS on maze) ──► state
             upcoming junction           questions.py (legal moves) ──► questions
                                         jev_client.py ───────────────► POST /alpha/decisions
             decision tagged   ◄──────── decide.py (validate, degrade) ◄── typed answers
             with junctionId
```

- **One maze, two readers.** [`shared/maze.json`](shared/maze.json) is loaded by both
  sides. The frontend renders and runs the game; the backend runs BFS on the same grid to
  derive per-direction features (nearest pellet, pellets within 8 tiles, nearest ghost and
  whether it is closing, dead ends). No grid travels over the wire. Requests carry only
  dynamic state, including which pellets have been eaten.
- **Prefetch, never block.** When Pac-Runner *enters the corridor* leading to a junction,
  `frontend/src/ai/decisionScheduler.js` fires the request, tagged with that junction's
  id and projected onto it (its position and the pellets it will eat on the way). The
  deadline is the estimated time until Pac-Runner reaches the junction.
- **Stale replies are discarded.** On arrival, a reply for *this* junction is applied. A
  reply for a junction already passed is dropped, never applied late.
- **Local fallback.** If no reply has landed by the junction, `ai/fallbackPolicy.js`
  decides in the browser: nearest pellet by BFS, a ghost-proximity penalty, and ghost
  chasing under power mode. The game never waits on the network, and it keeps playing with
  the backend down.
- **Jev-mode speed.** In Jev mode every entity runs at `JEV_SPEED_FACTOR = 0.75` of normal
  speed (`frontend/src/game/entities.js`). Short corridors were shorter than Jev's latency;
  slowing the clock gives the decision time to land without making the game wait on it.
  Human mode is untouched.
- **The badge contract.** Every decision carries a `source` the panel always shows:

  | Badge | Who chose the move |
  |---|---|
  | `jev` (teal) | Jev, via OpenRouter |
  | `stub` (grey) | The backend's local policy: stub mode, or live mode after a Jev failure |
  | `fallback` (amber) | The browser's local policy: no reply by the junction (the reason is shown) |

## Measured performance

Measured 2026-09-26 in Chrome (Playwright-driven, headless), live mode, Jev in control
from the first tick of each round. **Hit rate** = the share of junctions where Jev's reply
had arrived by the time Pac-Runner got there; the rest were decided by the browser's
fallback policy.

**Jev latency** (backend → OpenRouter → backend, 1,041 successful calls): **p50 393ms,
p90 700ms**, min ~320ms. 24 more calls (2.3%) hit the 900ms backend timeout and were
answered by the stub policy instead. Cost is about **$0.000035 per decision**.

**Hit rate, two full rounds per setting:**

| Setting | Round 1 | Round 2 | Both | Fallback reasons |
|---|---|---|---|---|
| Full speed (`JEV_SPEED_FACTOR = 1`) | 68% | 77% | **73%** (144 of 198) | all 53 "deadline" |
| `JEV_SPEED_FACTOR = 0.75` (shipped) | 88% | 80% | **83%** (162 of 195) | all 33 "deadline" |

Almost every miss is a *short corridor*, not a slow Jev: at full speed a 2-tile corridor
lasts ~480ms, less than Jev's median. That is why the fix slows the game in Jev mode rather
than lengthening the deadline (a longer deadline would only make the game wait).

Rounds vary a lot. A further round on the final code (after one last input fix; see
[docs/jev-examples.md](docs/jev-examples.md) §1) hit 73%, and its second round couldn't be
measured: OpenRouter started returning `403 RBAC: access denied` for the key mid-run. The
backend degraded as designed and the panel showed grey `stub` badges, never `jev`.

Jev never chose STAY in any measured round; the highest probability it ever gave STAY
was 0.15.

## Tests

```bash
cd backend  && .venv/bin/python -m pytest && .venv/bin/ruff check .
cd frontend && npm test && npm run lint && npm run build
```

Backend tests never touch the network. They pin `JEV_MODE=stub` regardless of your `.env`
and replay captured Jev responses through `respx`. Frontend tests (vitest) cover the pure
game engine and the decision scheduler.

## Repo layout

```
backend/app/       FastAPI app: features, questions, Jev client, decide, stub policy
backend/tests/     pytest
frontend/src/game  engine: plain JS, no React, stepped by a fixed-timestep loop
frontend/src/ai    decision scheduler, fallback policy, fetch client
frontend/src/components  React panel, HUD, controls (re-render at most ~10Hz)
shared/maze.json   the maze both sides load
docs/              jev-examples.md (real payloads), phase prompts
.claude/skills/    project conventions for Claude Code
```
