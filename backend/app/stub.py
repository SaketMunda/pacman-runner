"""Deterministic greedy policy: nearest pellet minus ghost-proximity penalty, inverted under
power. Pure function of the snapshot -- no randomness, no clock, no network."""

import math
from typing import Any

from app.features import extract
from app.maze import DIRECTIONS, MAZE, Maze
from app.models import GameStateIn, JevMoveOut

TEMPERATURE = 2.0
NO_PELLET_PENALTY = 30.0
DEAD_END_PENALTY = 4.0
GHOST_RANGE = 8


def _score(opt: dict[str, Any], powered: bool) -> float:
    pd = opt["pelletDistance"]
    score = -(NO_PELLET_PENALTY if pd is None else pd) + 0.3 * opt["pelletsWithin8"]
    if opt["deadEnd"]:
        score -= DEAD_END_PENALTY
    g = opt["nearestGhost"]
    if g and g["mode"] != "eaten" and g["distance"] <= GHOST_RANGE:
        pull = 16.0 / g["distance"]
        edible = powered or g["mode"] == "frightened"
        score += pull if edible else -pull
    return score


def _aggression(feats: dict[str, Any]) -> float:
    if feats["powerTicks"] > 0:
        return 3.5
    ds = [
        o["nearestGhost"]["distance"]
        for o in feats["options"].values()
        if o["nearestGhost"] and o["nearestGhost"]["mode"] not in ("eaten", "frightened")
    ]
    nearest = min(ds, default=None)
    if nearest is None or nearest > 10:
        return 2.4
    if nearest <= 3:
        return 0.5
    return 1.2 if nearest <= 6 else 1.8


def decide_stub(state: GameStateIn, maze: Maze = MAZE) -> JevMoveOut:
    feats = extract(state, maze)
    options = feats["options"]
    if not options:  # position not on a walkable tile: still answer, never 5xx
        return JevMoveOut(move="STAY", source="stub", junction_id=state.junction_id,
                          rationale="no legal moves from this tile")

    powered = feats["powerTicks"] > 0
    scores = {d: _score(o, powered) for d, o in options.items()}
    top = max(scores.values())
    weights = {d: math.exp((s - top) / TEMPERATURE) for d, s in scores.items()}
    total = sum(weights.values())
    probs = {d: round(w / total, 4) for d, w in weights.items()}
    best = min(probs, key=lambda d: (-probs[d], list(DIRECTIONS).index(d)))
    probs[best] = round(probs[best] + (1.0 - sum(probs.values())), 4)  # absorb rounding drift

    opt = options[best]
    pd = opt["pelletDistance"]
    bits = [f"nearest pellet {pd} tiles" if pd else "no pellet in reach"]
    if opt["nearestGhost"]:
        bits.append(f"{opt['nearestGhost']['name']} {opt['nearestGhost']['distance']} tiles")
    return JevMoveOut(
        move=best,
        move_probabilities=probs,
        aggression_score=_aggression(feats),
        confidence=probs[best],
        source="stub",
        junction_id=state.junction_id,
        rationale="; ".join(bits),
    )
