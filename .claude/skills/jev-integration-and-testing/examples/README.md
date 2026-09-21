# Fixtures

Mocks in `backend/tests/test_jev_client_mocked.py` replay these files via `respx`. Tests
never hit the network.

| File | Status |
|---|---|
| `junction-request.json` | SYNTHETIC — hand-built to schema v1 |
| `junction-response.json` | SYNTHETIC — replace with a real capture in Phase 5 |
| `malformed-response.json` | SYNTHETIC — exercises the degradation ladder |

**These are synthetic until a live call is captured.** They match the documented schema,
but a fixture that was never produced by the real service can encode a wrong assumption
and then defend it forever in the test suite. Phase 5 replaces the first two with real
captures and resolves the UNCONFIRMED items in `../references/decisions-api.md`.

To capture:

```bash
cd backend && JEV_MODE=live JEV_LOG_DECISIONS=true uvicorn app.main:app
# play a round, then take a raw exchange from backend/logs/decisions.jsonl
```

Scrub nothing but the key — the state and answers are game data, not secrets.
