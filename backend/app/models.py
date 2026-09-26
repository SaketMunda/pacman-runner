from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Direction = Literal["UP", "DOWN", "LEFT", "RIGHT"]
Move = Literal["UP", "DOWN", "LEFT", "RIGHT", "STAY"]
Source = Literal["jev", "stub", "fallback"]


class CamelModel(BaseModel):
    """Wire JSON is camelCase, Python is snake_case. Construct with snake_case kwargs."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Point(CamelModel):
    x: int
    y: int


class GhostIn(CamelModel):
    name: str
    position: Point
    mode: str  # chase | scatter | frightened | eaten -- lenient: an unknown mode must not 422
    direction: Direction | None = None


class GameStateIn(CamelModel):
    maze_id: str
    tick: int
    position: Point
    direction: Direction
    junction_id: str
    ghosts: list[GhostIn] = []
    power_ticks_remaining: int = 0
    pellets_remaining: int
    # Tiles whose pellet (or power pellet) has been eaten, as [x, y]. Without this the
    # backend only knows the starting layout and tells Jev every corridor is still full.
    eaten_pellets: list[tuple[int, int]] = []
    lives: int
    score: int


class JevMoveOut(CamelModel):
    move: Move
    move_probabilities: dict[str, float] | None = None
    aggression_score: float | None = None
    confidence: float | None = None
    source: Source
    latency_ms: int | None = None
    decision_id: str | None = None
    junction_id: str | None = None
    rationale: str | None = None
