# Jev examples: one junction, end to end

This page follows one real decision from the browser to Jev and back, then shows the
captured fixtures the tests replay. Every payload is labelled **REAL** (captured from a
live call) or **SYNTHETIC** (hand-built), the same convention as
[`.claude/skills/jev-integration-and-testing/examples/README.md`](../.claude/skills/jev-integration-and-testing/examples/README.md).

No API key or `Authorization` header appears anywhere on this page. The backend adds the
header at call time and never logs it.

| Payload | Status | Source |
|---|---|---|
| §1–§5 round trip at junction `15,23` | **REAL** | Captured 2026-09-26 from a live Jev-mode game in Chrome; the snapshot was intercepted from the browser's `POST /api/v1/jev-move` |
| §6 decision at junction `21,5` | **REAL** | Row from `backend/logs/decisions.jsonl`, measured run 2026-09-26 |
| `examples/junction-response.json` | **REAL** | `scripts/probe_jev.py`, 2026-09-22 |
| `examples/error-401.json` | **REAL** | `scripts/probe_jev.py` with a deliberately invalid key |
| `examples/junction-request.json` | **SYNTHETIC** | Hand-built to the schema doc; its `state` shape predates the code (see §7) |

---

## 1. The game snapshot (browser → backend) — REAL

Pac-Runner is heading LEFT along row 23 toward the junction at `(15, 23)`, all four ghosts
are frightened with 29 power ticks left, and 54 pellets have been eaten. The request was
fired mid-corridor, so `position` is **projected onto the junction** (`junctionId`), not
Pac-Runner's current tile. The pellets it will eat on the way count as eaten already.

```json
{
  "mazeId": "classic-28x31",
  "tick": 520,
  "position": { "x": 15, "y": 23 },
  "direction": "LEFT",
  "junctionId": "15,23",
  "ghosts": [
    { "name": "blinky", "position": { "x": 18, "y": 12 }, "mode": "frightened", "direction": "UP" },
    { "name": "pinky",  "position": { "x": 15, "y": 2 },  "mode": "frightened", "direction": "UP" },
    { "name": "inky",   "position": { "x": 14, "y": 17 }, "mode": "frightened", "direction": "LEFT" },
    { "name": "clyde",  "position": { "x": 14, "y": 17 }, "mode": "frightened", "direction": "LEFT" }
  ],
  "powerTicksRemaining": 29,
  "pelletsRemaining": 192,
  "eatenPellets": [[21, 20], [22, 20], [23, 20], [24, 20], "… 50 more [x, y] pairs"],
  "lives": 3,
  "score": 560
}
```

| Field | Meaning |
|---|---|
| `position` / `junctionId` | The junction the decision is *for*. The frontend applies a reply only if Pac-Runner reaches this exact junction; a reply for a junction already passed is discarded. |
| `direction` | Current heading. The backend passes it on as `heading`. |
| `ghosts[].direction` | Used to compute `closing` (§2). |
| `eatenPellets` | Every start-layout pellet tile that is gone. The backend knows the start layout from `shared/maze.json`; this is how it learns what is left. |

No grid travels over the wire. The backend already has the maze.

## 2. Derived features (backend) — REAL

`backend/app/features.py` turns the snapshot into a compact, per-direction description.
Its `options` keys are the legal directions from the junction, computed by BFS on the
shared maze. They are the single source for both the `state` and the question's
`criteria` below.

```json
{
  "heading": "LEFT",
  "powerTicks": 29,
  "pelletsLeft": 192,
  "lives": 3,
  "options": {
    "UP":    { "pelletDistance": 1, "pelletsWithin8": 14, "deadEnd": false,
               "nearestGhost": { "name": "inky", "distance": 13, "mode": "frightened", "closing": false } },
    "LEFT":  { "pelletDistance": 3, "pelletsWithin8": 16, "deadEnd": false,
               "nearestGhost": { "name": "inky", "distance": 15, "mode": "frightened", "closing": false } },
    "RIGHT": { "pelletDistance": 3, "pelletsWithin8": 16, "deadEnd": false,
               "nearestGhost": { "name": "inky", "distance": 15, "mode": "frightened", "closing": false } }
  }
}
```

| Field | Meaning |
|---|---|
| `pelletDistance` | BFS steps to the nearest remaining pellet if Pac-Runner takes this direction. `null` = none reachable. |
| `pelletsWithin8` | Remaining pellets within 8 BFS steps that way. It's a density signal. |
| `deadEnd` | The only way out is back through this junction. |
| `nearestGhost.distance` | BFS steps (tunnel-aware) to the closest ghost that way. |
| `nearestGhost.closing` | That ghost's next step along its heading brings it nearer the junction. |

DOWN is missing because it is a wall at `(15, 23)`. Jev never sees it as an option.

## 3. What is sent to Jev — REAL

`POST https://openrouter.ai/api/alpha/decisions` (OpenRouter's **Decisions API**, not
chat completions). The body is the features as `state` plus two typed questions:

```json
{
  "model": "~typesafe/jev-latest",
  "state": { "…": "exactly the §2 object" },
  "questions": {
    "move": {
      "type": "choice",
      "instructions": "Pac-Runner is at a junction and must commit to one direction. Choose the direction that best balances eating pellets against avoiding ghosts, given the state.",
      "criteria": {
        "UP": "Move up. Nearest pellet 1 tiles; 14 pellets within 8 tiles; nearest ghost inky (frightened) 13 tiles and not closing; not a dead end",
        "LEFT": "Move left. Nearest pellet 3 tiles; 16 pellets within 8 tiles; nearest ghost inky (frightened) 15 tiles and not closing; not a dead end",
        "RIGHT": "Move right. Nearest pellet 3 tiles; 16 pellets within 8 tiles; nearest ghost inky (frightened) 15 tiles and not closing; not a dead end",
        "STAY": "Hold the current heading and re-evaluate next tile."
      }
    },
    "aggression": {
      "type": "score",
      "instructions": "How much risk should Pac-Runner accept right now to collect pellets, given ghost positions and power-pellet state?",
      "criteria": [
        "Flee: ghosts are close and closing; give up pellets to survive.",
        "Cautious: keep distance, take only safe pellets.",
        "Neutral: normal pellet collection, no immediate threat.",
        "Hunting: powered up or ghosts are distant; push into dense pellets.",
        "Reckless: powered up with ghosts nearby; actively chase them down."
      ]
    }
  }
}
```

- **`move` is a `choice` whose options are the legal directions (plus STAY).** An illegal
  move is not an option Jev can return. The backend still re-checks, and so does the
  frontend.
- **`aggression` is a `score` over five ordered levels (0–4).** It does not steer
  Pac-Runner; it is telemetry that shows *why* a move was chosen.
- There is no prompt asking for confidence and no output format to parse. The answer
  types carry both.

## 4. What Jev answered — REAL

Latency 367ms, 877 input tokens, $0.000037.

```json
{
  "id": "gen-dec-1790404057-eBPQtZ5YcYKobYJCoKj2",
  "model": "typesafe/jev-1.13-20260917",
  "provider": "TypeSafe",
  "answers": {
    "move": {
      "type": "choice",
      "choice": "UP",
      "probabilities": { "UP": 0.55, "LEFT": 0.35, "RIGHT": 0.1, "STAY": 0 },
      "confidence": 0.4
    },
    "aggression": {
      "type": "score",
      "score": 2.86,
      "legend": { "0": "Flee: …", "1": "Cautious: …", "2": "Neutral: …", "3": "Hunting: …", "4": "Reckless: …" },
      "probabilities": { "0": 0, "1": 0.05, "2": 0.08, "3": 0.82, "4": 0.05 },
      "confidence": 0.81
    }
  },
  "usage": { "input_tokens": 877, "output_tokens": 62, "cost": 3.6834e-05 }
}
```

(The `legend` strings are the five criteria echoed back in full, shortened here.)

**This is Jev being genuinely uncertain, and it's the right call.** UP has the nearest
pellet (1 tile against 3), but LEFT and RIGHT have more pellets nearby (16 against 14), and
every ghost is frightened and far away, so nothing forces the choice. Jev picks UP with
only **0.55** and reports `confidence` **0.40**.

The split between LEFT and RIGHT is the interesting part. Their features are *identical*,
yet LEFT (keep going) gets 0.35 and RIGHT (turn back) gets 0.10. Jev prefers holding its
heading when nothing else separates the options. Aggression is 2.86 ("Hunting", 82% on
level 3): with the ghosts frightened, Jev will accept risk to collect pellets.

The response was from a replay of the in-game snapshot; the in-game call for the same
junction returned `UP 0.57 / LEFT 0.32 / RIGHT 0.11`, confidence 0.43, aggression 2.91.
Same state, nearly the same distribution: the probabilities are stable, not noise.

## 5. What the browser gets back, and what it does with it — REAL

`backend/app/decide.py` validates the answer (move ∈ legal, probabilities sum to 1 ±0.02,
score clamped to [0, 4]) and flattens it to camelCase:

```json
{
  "move": "UP",
  "moveProbabilities": { "UP": 0.57, "LEFT": 0.32, "RIGHT": 0.11, "STAY": 0 },
  "aggressionScore": 2.91,
  "confidence": 0.43,
  "source": "jev",
  "latencyMs": 367,
  "decisionId": "gen-dec-1790404028-XnP6DkOGHel2fCG8NgCh",
  "junctionId": "15,23",
  "rationale": "nearest pellet 1 tiles; inky 13 tiles"
}
```

| Field | UI |
|---|---|
| `move` | Queued as Pac-Runner's turn at `junctionId`, after re-checking it against the maze's legal directions. Shown large on the **Current decision** card. |
| `source` | The badge: `jev` (teal), `stub` (grey: the backend's local policy, Jev not called), `fallback` (amber: the browser's own policy, because no reply arrived by the junction). A new decision pulses the card in that colour. |
| `confidence` | "confidence 43%" under the badge. |
| `moveProbabilities` | **Probabilities** card: one bar per key that arrived, sorted descending, each with a text percentage. The key set varies by junction, so the UI never assumes four bars. |
| `aggressionScore` | **Aggression** meter: a marker at 2.91 / 4 plus the nearest label ("Hunting"). The fraction is kept on purpose. |
| `latencyMs` | Decision log and the median-latency stat. |

## 6. A second real decision: avoiding a ghost under uncertainty — REAL

From `decisions.jsonl` at junction `21,5`, heading RIGHT, no power, 101 pellets left.
All four directions look the same for pellets, and blinky is nearest in every direction,
but it is 3 tiles away going LEFT against 5 everywhere else:

| Option | Nearest pellet | Within 8 | Nearest ghost | Jev |
|---|---|---|---|---|
| RIGHT | 1 | 33 | blinky (scatter) 5, closing | **0.46** |
| UP | 1 | 33 | blinky (scatter) 5, closing | 0.43 |
| DOWN | 1 | 33 | blinky (scatter) 5, closing | 0.10 |
| LEFT | 1 | 33 | blinky (scatter) **3**, closing | **0.01** |

Jev chose RIGHT with confidence 0.32 and aggression 0.72 ("Cautious"). The only
distinguishing fact is the closer ghost, and Jev all but rules that direction out. Between
RIGHT and UP it effectively flips a coin and says so.

## 7. The captured fixtures

`backend/tests/test_jev_client_mocked.py` replays these through `respx`, so the tests never
touch the network.

**`junction-response.json` — REAL.** A confident answer: `UP` at 0.99, confidence 0.98,
aggression 0.31 (70% "Flee"). It's the same envelope shape as §4. One detail it settled:
`usage.output_tokens` is not 0 (it was 62), contrary to what the API docs implied.

**`error-401.json` — REAL.**

```json
{ "error": { "message": "Missing Authentication header", "code": 401 } }
```

`jev_client.py` classifies a 401 or 402 as `auth_error`. `decide.py` then answers with the
backend's stub policy (ladder rung 4) and `source: "stub"`, and the request still returns
200. The UI shows a grey `stub` badge, never `jev`.

**`junction-request.json` — SYNTHETIC.** It was hand-built to the schema reference before
the code existed, and its `state` differs from what `features.py` sends (it has
`livesRemaining` and a top-level `ghosts` list with `bearing`; the code sends §2's shape).
The mocks only check the response side, so it still works as a fixture. Use §3 above, not
this file, as the reference for what is actually sent.

**`malformed-response.json` — SYNTHETIC.** Illegal move, missing key, bad probability sum,
out-of-range score. These exercise the degradation ladder and can't be produced from a
real call on demand.
