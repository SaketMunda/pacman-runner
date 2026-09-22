# OpenRouter Decisions API — wire format

Reference for `~typesafe/jev-latest`. Verified against OpenRouter's published documentation
during project planning, then confirmed against a real call in Phase 5 via
`scripts/probe_jev.py` (2026-09-22) — see `../examples/README.md` for what's real vs
synthetic.

## Endpoint

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
```

Alpha endpoint — the path is `/api/alpha/decisions`, **not** `/api/v1/chat/completions`.

## Request

```json
{
  "model": "~typesafe/jev-latest",
  "state": { "any": "string, object, or array" },
  "questions": {
    "<key>": {
      "type": "noul | choice | score",
      "instructions": "what you are asking",
      "criteria": "required for choice and score"
    }
  }
}
```

`state` accepts a string, object or array. One request may carry many questions, answered
together against the same state — cheaper and more coherent than separate calls.

### Question types

| type | `criteria` | returns |
|---|---|---|
| `noul` | not required | `noul`: P(yes), 0–1 |
| `choice` | **required** — map of option → rubric string | top `choice` + full `probabilities` + `confidence` |
| `score` | **required** — ordered list of level descriptions | weighted-mean `score` + `legend` + `probabilities` + `confidence` |

## Worked example (from OpenRouter's docs)

```bash
curl -s https://openrouter.ai/api/alpha/decisions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "typesafe/jev-1.13",
    "state": {
      "message": "My invoice lists two seats, but only one of us can sign in, and the login page keeps timing out.",
      "plan": "team"
    },
    "questions": {
      "queue": {
        "type": "choice",
        "instructions": "Which team should handle this message?",
        "criteria": {
          "billing": "Charges, invoices, refunds, seats on the bill",
          "technical": "Bugs, outages, login problems, integrations",
          "other": "Anything else"
        }
      },
      "angry": { "type": "noul", "instructions": "Is the customer angry?" }
    }
  }'
```

## Response

```json
{
  "id": "gen-dec-abc123",
  "model": "typesafe/jev-1.13",
  "provider": "TypeSafe",
  "answers": { "...": "one entry per question key" },
  "usage": { "input_tokens": 120, "output_tokens": 0, "cost": 0.0000050 }
}
```

Field order in a real response is not `id, model, provider, answers, usage` — `id` and
`provider` can trail after `usage`. Don't rely on key order; parse by name (pydantic already
does).

Answer shapes by type:

```json
{ "type": "noul", "noul": 0.98 }
```

```json
{ "type": "choice", "choice": "billing",
  "probabilities": { "billing": 0.87, "technical": 0.13, "sales": 0 },
  "confidence": 0.80 }
```

```json
{ "type": "score", "score": 1.05,
  "legend": { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
  "probabilities": { "0": 0, "1": 0.95, "2": 0.05 },
  "confidence": 0.92 }
```

Notes that matter for our code:

- `probabilities` sums to 1. `confidence` measures how *peaked* the distribution is — it is
  not the top probability, and the two can diverge.
- `score` is the probability-weighted mean of the level **indexes**, so it lands between
  integers. `legend` maps index → the level description you supplied.
- **`usage.output_tokens` is not 0.** The real capture showed 62 output tokens for a
  two-question call, despite the "no text generation" framing and the worked example above.
  Don't assume output is free when estimating cost — `usage.cost` is the number to trust.
- `resolved model` in the response body is a dated pin (`typesafe/jev-1.13-20260917`), even
  when the request used the `~typesafe/jev-latest` alias. Log what we sent, not what came
  back, if you want to track which alias resolved.

## Limits and cost

- Context window: 32,000 tokens.
- $0.042 per 1M input tokens. Output is **not** free in practice (see above) but is a small
  fraction of cost at these token counts — the real capture cost $0.0000437 total.
- Rate limits: still undocumented publicly; not exercised by the probe.
- Latency: measured in Phase 5, see below.

## Resolved (Phase 5, `scripts/probe_jev.py`, 2026-09-22)

1. **`score` criteria as a JSON array is accepted as-is.** No index-keyed object fallback
   was needed — send the ordered list exactly as `question-schema-v1.md` documents.
2. **`~typesafe/jev-latest` resolves directly**, no need to fall back to the pinned
   `typesafe/jev-1.13`. The response's `model` field reports the dated pin it resolved to
   (`typesafe/jev-1.13-20260917`).
3. **401 body shape**: `{"error": {"message": "Missing Authentication header", "code": 401}}`
   — note the message text is generic and doesn't distinguish "missing" from "invalid" key.
4. **Single-call latency observed: ~870ms** for the two-question junction payload (~1040
   input tokens). This is a single sample, not a distribution — `decide.py`'s degradation
   ladder and the frontend's prefetch deadline are the real hedge against variance, not this
   number alone.
