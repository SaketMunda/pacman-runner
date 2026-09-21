# Backend file layout

```
backend/
  .env.example          committed; backend/.env is gitignored
  pyproject.toml
  app/
    main.py             FastAPI app, CORS, router mount, startup validation
    config.py           Settings (pydantic-settings), read once at wiring time
    models.py           CamelModel base + GameStateIn / JevMoveOut / GhostIn
    maze.py             load shared/maze.json, walkability, legal_moves, bfs_distances
    features.py         GameStateIn -> compact dict for Jev's `state`
    questions.py        v1 question builders (see jev-integration-and-testing)
    jev_client.py       async httpx POST to /alpha/decisions
    decide.py           orchestrator: features -> questions -> client -> validate
    stub.py             deterministic greedy policy (no network)
    telemetry.py        append decisions to backend/logs/decisions.jsonl
    api/v1/routes.py    POST /jev-move, GET /health
  tests/
    conftest.py           shared fixtures: loaded maze, a mid-maze junction snapshot
    test_maze.py          walkability, legal_moves, tunnel-aware BFS
    test_features.py      snapshot -> state mapping, payload stays compact
    test_questions.py     v1 schema shape, legal-moves-only criteria
    test_decide_stub.py   deterministic policy, same input -> same output
    test_jev_client_mocked.py  respx fixtures of real Jev responses
    test_api.py           endpoint contract, camelCase aliases, degradation to 200
  logs/                 gitignored, created on demand
```

## Request / response shapes

`POST /api/v1/jev-move` request (camelCase on the wire):

```json
{
  "mazeId": "classic-28x31",
  "tick": 412,
  "position": { "x": 12, "y": 14 },
  "direction": "LEFT",
  "junctionId": "12,14@412",
  "ghosts": [
    { "name": "blinky", "position": {"x": 15, "y": 14}, "mode": "chase", "direction": "LEFT" }
  ],
  "powerTicksRemaining": 0,
  "pelletsRemaining": 173,
  "lives": 3,
  "score": 710
}
```

Response:

```json
{
  "move": "LEFT",
  "moveProbabilities": { "LEFT": 0.71, "UP": 0.22, "DOWN": 0.07 },
  "aggressionScore": 2.4,
  "confidence": 0.68,
  "source": "jev",
  "latencyMs": 180,
  "decisionId": "gen-dec-abc123",
  "junctionId": "12,14@412",
  "rationale": "nearest pellet 3 tiles left; blinky 3 tiles right and closing"
}
```

`junctionId` is echoed back verbatim. The frontend uses it to discard replies that arrive
after Pac-Runner has already left that junction — see the frontend skill.

`moveProbabilities` contains only the legal directions, so its key set varies per request.
The UI must render whatever keys arrive rather than assuming four bars.
