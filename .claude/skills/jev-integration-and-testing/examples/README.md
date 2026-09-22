# Fixtures

Mocks in `backend/tests/test_jev_client_mocked.py` replay these files via `respx`. Tests
never hit the network.

| File | Status |
|---|---|
| `junction-request.json` | SYNTHETIC — hand-built to schema v1; the exact request sent for the real capture below |
| `junction-response.json` | REAL — captured via `scripts/probe_jev.py` on 2026-09-22 against `~typesafe/jev-latest` |
| `error-401.json` | REAL — captured via `scripts/probe_jev.py` with a deliberately invalid key |
| `malformed-response.json` | SYNTHETIC — exercises the degradation ladder (illegal move, missing key, bad sum, out-of-range score); these failure shapes aren't producible from a real call on demand |

**Phase 5 resolved the UNCONFIRMED items** in `../references/decisions-api.md`: the model
slug resolves as `~typesafe/jev-latest`, `score` criteria as a JSON array is accepted as-is
(no index-keyed fallback needed), and the 401 body is `{"error": {"message": ..., "code":
401}}`. One documented assumption was wrong: `usage.output_tokens` was 62 in the real
capture, not 0.

To recapture (e.g. after a schema change):

```bash
cd backend && ../scripts/probe_jev.py   # manual probe, not a test -- prints raw bodies
```

Scrub nothing but the key — the state and answers are game data, not secrets.
