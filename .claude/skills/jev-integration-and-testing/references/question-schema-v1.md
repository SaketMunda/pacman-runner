# Question schema v1

`QUESTION_SCHEMA_VERSION = 1` in `backend/app/questions.py`. Changing anything here means
bumping that constant and adding a new fixture rather than editing an existing one.

Two questions, asked together in a single call against one junction snapshot.

## `move` — choice

```python
{
  "type": "choice",
  "instructions": (
      "Pac-Runner is at a junction and must commit to one direction. "
      "Choose the direction that best balances eating pellets against "
      "avoiding ghosts, given the state."
  ),
  "criteria": {  # ONLY directions that are not walls at this junction
      "LEFT":  "Move left. <derived rubric for this junction>",
      "UP":    "Move up. <derived rubric for this junction>",
      # ...
      "STAY":  "Hold the current heading and re-evaluate next tile.",
  },
}
```

Criteria keys are the legal directions **plus** `STAY`. Rubrics are generated per junction
from the same derived features that go into `state` — for example:

```
"LEFT": "Move left. Nearest pellet 3 tiles; 11 pellets within 8 tiles; nearest ghost
         (blinky, chase) 3 tiles and closing; not a dead end."
```

Writing the rubric as decision guidance rather than a label is what makes the distribution
meaningful. "Go left" tells Jev nothing it cannot already see.

`STAY` is included per the product spec and means "hold the current heading". It is rarely
the right answer in Pac-Man and we expect it to carry low probability; the frontend maps it
to continuing in the current direction. It is kept rather than dropped so the option set
matches the documented contract.

## `aggression` — score

```python
{
  "type": "score",
  "instructions": (
      "How much risk should Pac-Runner accept right now to collect pellets, "
      "given ghost positions and power-pellet state?"
  ),
  "criteria": [
      "Flee: ghosts are close and closing; give up pellets to survive.",
      "Cautious: keep distance, take only safe pellets.",
      "Neutral: normal pellet collection, no immediate threat.",
      "Hunting: powered up or ghosts are distant; push into dense pellets.",
      "Reckless: powered up with ghosts nearby; actively chase them down.",
  ],
}
```

Five ordered levels → indexes 0–4. Returns a weighted mean, so **2.4 is normal**. The
response's `legend` maps index → level text; the UI shows the nearest label plus the float.

Aggression does not directly change the move — the move question already accounts for
risk. It is telemetry: it exposes *why* a move was chosen and gives the panel something
continuous to render. If we later feed it back into the fallback policy, that is a v2
change.

## Full request shape

```json
{
  "model": "~typesafe/jev-latest",
  "state": {
    "position": {"x": 12, "y": 14},
    "heading": "LEFT",
    "livesRemaining": 3,
    "pelletsRemaining": 173,
    "powerTicksRemaining": 0,
    "options": {
      "LEFT": {"pelletDistance": 3, "pelletsWithin8": 11, "deadEnd": false,
               "nearestGhost": {"name": "blinky", "distance": 3, "mode": "chase", "closing": true}},
      "UP":   {"pelletDistance": 1, "pelletsWithin8": 6,  "deadEnd": false,
               "nearestGhost": {"name": "pinky", "distance": 9, "mode": "scatter", "closing": false}}
    },
    "ghosts": [
      {"name": "blinky", "distance": 3, "mode": "chase", "bearing": "RIGHT"},
      {"name": "pinky",  "distance": 9, "mode": "scatter", "bearing": "UP"}
    ]
  },
  "questions": { "move": {...}, "aggression": {...} }
}
```

`options` is keyed by the same legal directions as the `move` criteria — keep the two in
sync from one source in `features.py`, never build them independently.

All distances are **BFS through the maze**, tunnel-aware. `closing` compares this
junction's distance to the previous snapshot's.
