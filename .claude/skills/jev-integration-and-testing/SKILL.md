---
name: jev-integration-and-testing
description: How Jev Pac-Runner talks to Jev and how it is tested. Load when touching the Jev call itself, building the state or questions payload, adding or changing a decision question, or writing tests and mocks for any of it. Covers the OpenRouter Decisions API wire format, question schema v1, and validation of returned distributions.
---

# Jev integration & testing

## Jev is not a chat model

This is the thing that trips people up. Jev is served from OpenRouter's **alpha Decisions
API**, a different endpoint with a different body and no text output at all:

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
```

You send a `state` (string, object or array) and a map of typed `questions`. You get back
typed answers with calibrated probabilities. There is no `messages`, no `prompt`, no
streaming, no `choices[0].message.content`. Do not reach for the OpenAI SDK.

Full request/response schema with worked examples: `references/decisions-api.md`.
Our frozen question set: `references/question-schema-v1.md`.
Captured real payloads for mocks: `examples/`.

## Building `state` — compact and derived

Send judgement-ready features, not raw data. Jev is choosing a direction, so the state is
organised *by direction* — that framing does most of the work.

Never send the maze grid. Both sides already load `shared/maze.json`; the grid would be
~900 tokens per junction for information the backend already has. Send derived scalars
instead: per-direction pellet distance, ghost BFS distance and bearing, dead-end flag,
power ticks remaining, lives.

Rules of thumb:
- **BFS distance, never Euclidean.** A ghost 3 tiles away through a wall is not a threat,
  and Euclidean distance will confidently tell you it is.
- One junction snapshot should land well under 400 tokens. If it grows past that, a raw
  field crept in.
- Every field must plausibly change the answer. Unused fields cost tokens and dilute the
  signal.

## Questions — legal moves only

The `move` question's `criteria` is built from **only the directions that aren't walls at
this junction**. This is the central trick: Jev structurally cannot choose into a wall,
because the illegal option is never offered.

Validate the returned move against the legal set anyway. It should be unreachable — which
is exactly why it is worth asserting, since if it ever fires, criteria construction broke.

## Validating what comes back

| Check | Tolerance | On failure |
|---|---|---|
| `answers.move.choice` ∈ legal moves | exact | fall back to stub |
| `probabilities` sum | 1.0 ± 0.02 | keep move, null the distribution |
| `aggression.score` ∈ [0, 4] | inclusive | clamp |
| `confidence` ∈ [0, 1] | inclusive | clamp |

`score` is a **probability-weighted mean of level indexes**, so 2.4 is a valid answer to a
0–4 question, not a bug. Never round it to an int — the fractional part is the calibration.

## Changing the schema

Question keys and criteria are a contract with the captured fixtures in `examples/`.
To change them: bump `QUESTION_SCHEMA_VERSION` in `questions.py`, add a new fixture rather
than editing the old one, and update `references/question-schema-v1.md` (or add a v2 file).
Tests assert against fixtures, so a silent criteria edit turns into a confusing test failure
two phases later.

## Testing

Three layers, none of which hit the network:

1. **Builders** (`test_features.py`, `test_questions.py`) — pure functions on a fixture
   snapshot. Assert shape, legal-moves-only criteria, and that payload size stays bounded.
2. **Mocked transport** (`test_jev_client_mocked.py`) — `respx` replaying real captured
   responses from `examples/`. This is where malformed answers, timeouts and 401s are
   exercised.
3. **Determinism** (`test_decide_stub.py`) — the stub policy must give identical output for
   identical input, so game-logic tests never flake.

**Never write a test that calls the live API.** It costs money, needs a key, and fails in
CI. Capture a real response once, save it in `examples/`, mock it forever after.

For end-to-end play, run the whole game with `JEV_MODE=stub`: full game logic, deterministic
decisions, no key required.

## Gotchas

- **Model slug is unconfirmed.** We default to `~typesafe/jev-latest`; OpenRouter's own docs
  example uses the pinned `typesafe/jev-1.13`. It is env-configurable for this reason — if
  live calls 404, try the pinned slug before debugging anything else.
- **`criteria` is required** for both `choice` and `score`. Omitting it is a 4xx, not a
  default.
- Rubric text in `criteria` is doing real work — it is how Jev knows what "UP" *means* here.
  Write the rubrics as decision guidance ("leads toward dense pellets, no ghost within 5
  tiles"), not as labels ("go up").
- Output tokens are free and input is $0.042/1M, so cost is negligible; **latency is the
  real budget**, not spend. Measure it before tuning the prefetch deadline.
- Log `legalMoves` next to every decision. A probability distribution is uninterpretable
  without the option set it was drawn from.
