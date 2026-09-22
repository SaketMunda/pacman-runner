"""Append one JSONL line per decision to backend/logs/decisions.jsonl when
JEV_LOG_DECISIONS=true. Never writes the key or the maze grid -- only decision-shaped data.
"""

import json
import time
from pathlib import Path
from typing import Any

LOG_PATH = Path(__file__).resolve().parents[1] / "logs" / "decisions.jsonl"


def log_decision(
    *,
    junction_id: str,
    source: str,
    move: str,
    rung: int,
    legal_moves: list[str],
    probabilities: dict[str, float] | None = None,
    aggression: float | None = None,
    confidence: float | None = None,
    latency_ms: int | None = None,
    schema_version: int | None = None,
    cost: float | None = None,
) -> None:
    record: dict[str, Any] = {
        "ts": time.time(),
        "junctionId": junction_id,
        "source": source,
        "move": move,
        "rung": rung,
        "legalMoves": legal_moves,
        "probabilities": probabilities,
        "aggression": aggression,
        "confidence": confidence,
        "latencyMs": latency_ms,
        "schemaVersion": schema_version,
        "cost": cost,
    }
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(record) + "\n")
