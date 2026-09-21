# Degradation ladder

The game is real-time. A decision that is late is worth exactly as much as no decision, and
an error page is worth less than a mediocre move. So **`/api/v1/jev-move` returns 200 for
every input it can parse.** The only 4xx is a malformed request body (pydantic rejects it);
the only 5xx is a genuine bug in our own code.

Each rung falls to the next. `source` in the response records where it landed.

| # | Condition | Action | `source` | Log level |
|---|---|---|---|---|
| 1 | `JEV_MODE=stub` | skip the network entirely | `stub` | debug |
| 2 | Jev answers, move is legal, distribution valid | use it | `jev` | info |
| 3 | Timeout / connect error / 5xx from OpenRouter | stub policy | `stub` | warning |
| 4 | 401 / 402 from OpenRouter | stub policy, and flag config | `stub` | error |
| 5 | Answer missing the `move` key, or wrong `type` | stub policy | `stub` | warning |
| 6 | `move` not in the legal set for this junction | stub policy | `stub` | warning |
| 7 | Probabilities absent or don't sum to ~1 (±0.02) | keep the move, null the distribution | `jev` | warning |
| 8 | `aggressionScore` outside [0, 4] | clamp | `jev` | warning |

Rung 6 should be unreachable — we build the `choice` criteria from only the legal moves, so
Jev has no illegal option to pick. Validate anyway: it is the assertion that tells us the
criteria construction broke, and it is cheap.

Rung 7 is deliberately *not* a full fallback. A correct move with an unusable bar chart is
still a good move; degrade the telemetry, not the gameplay.

## Logging

One structured line per decision at INFO, plus a JSONL append when `JEV_LOG_DECISIONS=true`:

```
backend/logs/decisions.jsonl
{"ts":..., "junctionId":"12,14@412", "source":"jev", "move":"LEFT",
 "probabilities":{...}, "aggression":2.4, "confidence":0.68,
 "latencyMs":180, "legalMoves":["LEFT","UP","DOWN"], "cost":0.0000031}
```

This file is how we answer "is Jev actually playing well, or just moving?" after a run.
Log `legalMoves` alongside the choice — a distribution is only interpretable next to the
options it was chosen from.

Never log `OPENROUTER_API_KEY`, and never log the full maze.

## Startup validation

`JEV_MODE=live` with no `OPENROUTER_API_KEY` must raise at startup, not on the first
junction. A game that silently runs on the stub while the user believes it is running on
Jev is the single most misleading failure this project can have.
