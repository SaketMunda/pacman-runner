# Phase 5 — Live Jev

Paste everything below the line into a fresh session at the repo root.

---

Work in /Users/saketmunda/Work/Startup/projects/pacman-runner. Read plan.md first, then
load the `jev-integration-and-testing` and `jev-game-backend` skills and read all of their
references and examples, especially references/decisions-api.md,
references/question-schema-v1.md and references/error-handling.md. Phases 2–4 are done and
committed. The game plays end to end against the stub backend.

Implement Phase 5 only: the backend calls Jev through OpenRouter's alpha Decisions API
when `JEV_MODE=live`. Stub mode must keep working exactly as it does now. Don't change
frontend/ unless a bug blocks the live run, and if one does, report it rather than
redesigning anything.

## Secrets — non-negotiable

- The key lives only in backend/.env, which is gitignored. **Never ask me to paste the key
  into chat.** If backend/.env is missing or has no key, stop and tell me to create it from
  backend/.env.example.
- Check for the key without printing it:
  `grep -c '^OPENROUTER_API_KEY=sk-or-' backend/.env`.
- Never print, log or commit the key or the Authorization header. That covers code,
  console output, logs, fixtures and commit messages.
- Before committing, run `git diff --cached | grep -c 'sk-or-'`. It must print 0.

## Step 1 — Probe before building (resolve the UNCONFIRMED items)

decisions-api.md lists three UNCONFIRMED items: the `score` criteria encoding, the model
slug, and the error body shape. Resolve them with a real call **before** writing
questions.py, so the code is built on what the service actually accepts rather than on
guesses.

Write `scripts/probe_jev.py`. It is a manual script, not a test, and pytest must never
collect it. It reads backend/.env and sends the v1 questions for the fixed junction in
examples/junction-request.json:
- Try `~typesafe/jev-latest` first. If that returns 404 or an unknown-model error, try
  `typesafe/jev-1.13`.
- Send `score` criteria as a JSON array. If the service rejects that, try an index-keyed
  object.
- Make one call with a deliberately invalid key to capture the 401 body.
- Print the status, the wall-clock latency and the raw body for each call. Keep the whole
  probe to about 10 calls.

Then:
- Replace examples/junction-response.json with the real capture. Add
  examples/error-401.json. Update examples/README.md to mark which files are REAL and
  which are SYNTHETIC.
- Rewrite the UNCONFIRMED section of decisions-api.md with what you observed, and fix
  anything else the real response contradicts, such as field names, `legend` or
  `confidence`.
- Set the working slug as the `JEV_MODEL` default in config.py and in .env.example.

**If neither slug works, or auth fails with a valid-looking key, stop and report.** Don't
build the client against guesses.

## Step 2 — Build

1. **backend/app/questions.py**: `QUESTION_SCHEMA_VERSION = 1`.
   - `build_questions(features)` → the `move` choice plus the `aggression` score, per
     question-schema-v1.md.
   - `move` criteria keys come from the same source as `features["options"]` (the legal
     directions) plus `STAY`. Never define a separate list.
   - Rubrics are generated per junction from that direction's features and phrased as
     decision guidance, not labels.
   - Use the `score` criteria encoding the probe confirmed.
2. **backend/app/jev_client.py**: async httpx POST to `{OPENROUTER_BASE_URL}/decisions`.
   - Create **one shared `AsyncClient`** in the FastAPI lifespan and close it on shutdown.
     Connection reuse matters for latency.
   - Take the timeout from settings.
   - Return a typed result or a typed error: timeout, connect, 5xx, auth (401/402), 4xx,
     or bad-body. Log the error body without the key.
3. **backend/app/decide.py**: owns the 8-rung degradation ladder in error-handling.md.
   - Validate the move is in the legal set, the probabilities sum to 1 ± 0.02, the score
     is in [0,4] (clamp if not), and the confidence is in [0,1] (clamp if not).
   - Map to `JevMoveOut` with `source` set honestly.
   - Keep `STAY` in `moveProbabilities` if Jev returns it.
4. **routes.py**: switch from `decide_stub` to `decide`. Stub mode still skips the network
   entirely.
5. **JSONL decision log** at backend/logs/decisions.jsonl when `JEV_LOG_DECISIONS=true`,
   in the format in error-handling.md. Also include `legalMoves`, `schemaVersion`,
   `latencyMs`, `cost` and the rung that fired. The log must never contain the key or the
   grid.
6. `GET /api/v1/health` also reports the model slug and whether a key is configured, as a
   boolean. It never returns the key itself.

## Step 3 — Tests (none call the live API)

- test_questions.py:
  - Criteria are legal moves plus STAY and match the `options` keys.
  - The score criteria shape matches the confirmed encoding.
  - The serialized request stays under about 400 tokens.
- test_jev_client_mocked.py: uses respx, replaying the **real** capture, plus the
  malformed fixture, a timeout, the real 401 body and a 500.
- test_decide.py: one test per ladder rung, asserting the resulting `source` and move.
- The existing tests stay green.

## Step 4 — Live run and latency

1. Set `JEV_TIMEOUT_SECONDS` in backend/.env to at most the frontend's
   `DEADLINE_CEILING_MS` (1000ms in frontend/src/ai/decisionScheduler.js). A backend
   call that outlives the frontend's deadline does work nobody will use. Use 0.9 to
   start.
2. Run both servers with `JEV_MODE=live` and play two full rounds in Jev mode. Confirm
   the panel shows `jev` badges.
3. Report from decisions.jsonl and the panel:
   - decision counts by `source` and rung;
   - Jev latency p50 and p90;
   - frontend hit rate and fallback reasons;
   - how often Jev picked STAY, and whether that ever stalled Pac-Runner.
4. Sanity-read about 10 decisions against their `legalMoves` and features. Do the
   distributions look like judgement? For example, does it avoid a chasing ghost and
   head toward pellets? Don't just check that it moves.
5. For reference, Pac-Runner covers about 4.2 tiles/s (TICK_HZ 30 × BASE_SPEED 0.14),
   so a typical corridor gives 0.7–1.2s of headroom. **If the frontend hit rate is below
   about 70%, stop and present options with your numbers** rather than picking one. For
   example: a slower Jev-mode game speed, prefetching two junctions ahead, or accepting
   the current rate. I'll decide.

## Verify before reporting done

- In backend: `.venv/bin/python -m pytest` green and `.venv/bin/ruff check .` clean.
- In frontend: `npx vitest run` green.
- With `JEV_MODE=stub` and no key, the game behaves exactly as before.
- With `JEV_MODE=live` and no key, the backend fails at startup with a clear message.
- With `JEV_MODE=live` and a bad key, the game keeps playing, `source` is `stub`, and an
  error is logged with the 401 body.
- Say which checks you did in a real browser and which you couldn't.

Then commit, ending the message with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, and stop. Commit the real
fixtures. Don't commit decisions.jsonl or .env. Don't start Phase 6.

Report:
- the resolved UNCONFIRMED items;
- latency, hit rate and the decision quality read;
- anything in the skills that the real API contradicted.
