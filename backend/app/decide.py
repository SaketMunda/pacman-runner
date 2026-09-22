"""Orchestrator: features -> questions -> jev_client -> validate -> JevMoveOut.

The only module that knows about every other one. Owns the 8-rung degradation ladder in
error-handling.md -- `/api/v1/jev-move` must never return anything but 200, and `source`
must always be honest about who actually chose the move.
"""

import logging

import httpx

from app.config import Settings
from app.features import extract
from app.jev_client import JevError, JevSuccess, call_jev
from app.maze import MAZE, Maze
from app.models import GameStateIn, JevMoveOut
from app.questions import QUESTION_SCHEMA_VERSION, build_questions
from app.stub import decide_stub
from app.telemetry import log_decision

log = logging.getLogger(__name__)

_ERROR_RUNG = {
    "timeout": 3,
    "connect": 3,
    "server_error": 3,
    "auth_error": 4,
    "client_error": 5,
    "bad_body": 5,
}


def _rationale(feats: dict, move: str) -> str:
    opt = feats["options"].get(move)
    if opt is None:  # STAY, or a tile with no legal moves
        return "jev chose to hold heading" if move == "STAY" else "jev decision"
    pd = opt["pelletDistance"]
    bits = [f"nearest pellet {pd} tiles" if pd else "no pellet in reach"]
    if opt["nearestGhost"]:
        bits.append(f"{opt['nearestGhost']['name']} {opt['nearestGhost']['distance']} tiles")
    return "; ".join(bits)


def _fallback(
    state: GameStateIn, maze: Maze, rung: int, legal_moves: list[str], jev_latency_ms: int | None
) -> JevMoveOut:
    out = decide_stub(state, maze)
    if jev_latency_ms is not None:
        out.latency_ms = jev_latency_ms
    log_decision(
        junction_id=state.junction_id,
        source=out.source,
        move=out.move,
        rung=rung,
        legal_moves=legal_moves,
        probabilities=out.move_probabilities,
        aggression=out.aggression_score,
        confidence=out.confidence,
        latency_ms=out.latency_ms,
        schema_version=QUESTION_SCHEMA_VERSION,
    )
    return out


async def decide(
    state: GameStateIn, client: httpx.AsyncClient, settings: Settings, maze: Maze = MAZE
) -> JevMoveOut:
    if settings.jev_mode == "stub":
        out = decide_stub(state, maze)
        log_decision(
            junction_id=state.junction_id,
            source=out.source,
            move=out.move,
            rung=1,
            legal_moves=list(extract(state, maze)["options"]),
            probabilities=out.move_probabilities,
            aggression=out.aggression_score,
            confidence=out.confidence,
            latency_ms=out.latency_ms,
            schema_version=QUESTION_SCHEMA_VERSION,
        )
        return out

    feats = extract(state, maze)
    legal_directions = list(feats["options"])
    legal_set = set(legal_directions) | {"STAY"}

    if not legal_directions:  # position not on a walkable tile: stub already handles this
        return _fallback(state, maze, rung=6, legal_moves=legal_directions, jev_latency_ms=None)

    questions = build_questions(feats)
    result = await call_jev(client, settings, feats, questions)

    if isinstance(result, JevError):
        log.warning("Jev call failed (%s): %s", result.kind, result.detail)
        return _fallback(state, maze, _ERROR_RUNG[result.kind], legal_directions, result.latency_ms)

    assert isinstance(result, JevSuccess)
    move_answer = result.answers.get("move")
    move_ok = (
        isinstance(move_answer, dict)
        and move_answer.get("type") == "choice"
        and "choice" in move_answer
    )
    if not move_ok:
        log.warning("Jev answer missing move choice: %s", move_answer)
        return _fallback(
            state, maze, rung=5, legal_moves=legal_directions, jev_latency_ms=result.latency_ms
        )

    move = move_answer["choice"]
    if move not in legal_set:
        log.warning("Jev chose illegal move %s outside legal set %s", move, legal_set)
        return _fallback(
            state, maze, rung=6, legal_moves=legal_directions, jev_latency_ms=result.latency_ms
        )

    probabilities = move_answer.get("probabilities")
    if not isinstance(probabilities, dict) or abs(sum(probabilities.values()) - 1.0) > 0.02:
        log.warning("Jev probabilities invalid or don't sum to 1: %s", probabilities)
        probabilities = None  # rung 7: keep the move, null the distribution, source stays jev

    confidence = move_answer.get("confidence")
    if isinstance(confidence, int | float):
        confidence = max(0.0, min(1.0, float(confidence)))
    else:
        confidence = None

    aggression_score = None
    agg_answer = result.answers.get("aggression")
    if isinstance(agg_answer, dict) and isinstance(agg_answer.get("score"), int | float):
        aggression_score = max(0.0, min(4.0, float(agg_answer["score"])))  # rung 8: clamp

    out = JevMoveOut(
        move=move,
        move_probabilities=probabilities,
        aggression_score=aggression_score,
        confidence=confidence,
        source="jev",
        latency_ms=result.latency_ms,
        decision_id=result.decision_id,
        junction_id=state.junction_id,
        rationale=_rationale(feats, move),
    )
    log_decision(
        junction_id=state.junction_id,
        source="jev",
        move=move,
        rung=2,
        legal_moves=legal_directions,
        probabilities=probabilities,
        aggression=aggression_score,
        confidence=confidence,
        latency_ms=result.latency_ms,
        schema_version=QUESTION_SCHEMA_VERSION,
        cost=result.cost,
    )
    return out
