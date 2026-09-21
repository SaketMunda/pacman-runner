import pytest

from app.models import GameStateIn


def make_state(x=12, y=5, direction="LEFT", ghosts=None, power=0, **kw) -> GameStateIn:
    return GameStateIn(
        maze_id="classic-28x31", tick=412, position={"x": x, "y": y}, direction=direction,
        junction_id=f"{x},{y}@412", ghosts=ghosts or [], power_ticks_remaining=power,
        pellets_remaining=173, lives=3, score=710, **kw,
    )


def ghost(name, x, y, mode="chase"):
    return {"name": name, "position": {"x": x, "y": y}, "mode": mode, "direction": "LEFT"}


@pytest.fixture
def junction() -> GameStateIn:
    """Row 5 open corridor at x=12: a four-way-ish junction with a chasing blinky nearby."""
    return make_state(12, 5, ghosts=[ghost("blinky", 15, 5)])
