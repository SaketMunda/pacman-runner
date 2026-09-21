# OpenRouter Decisions API — wire format

Reference for `~typesafe/jev-latest`. Verified against OpenRouter's published documentation
during project planning; anything marked UNCONFIRMED must be checked against a live call
before tests are frozen against it.

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
- `usage.output_tokens` is 0; Jev generates no text.

## Limits and cost

- Context window: 32,000 tokens.
- $0.042 per 1M input tokens; $0 output.
- Rate limits: UNCONFIRMED — not documented publicly.
- Latency: UNCONFIRMED — measure it before tuning the prefetch deadline.

## UNCONFIRMED items to resolve on the first live call

1. Exact `criteria` encoding for `score` — documented as an ordered level list; confirm
   whether it is a JSON array or an index-keyed object.
2. Whether `~typesafe/jev-latest` resolves, or the pinned `typesafe/jev-1.13` is required.
3. Error body shape for 4xx/401/402, so `jev_client.py` can log something useful.

When resolved, capture the real response into `../examples/` and update this file.
