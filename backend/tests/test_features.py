import json

from app.features import extract, legal_directions
from app.maze import DIRECTIONS
from tests.conftest import ghost, make_state


def test_shape(junction):
    f = extract(junction)
    assert set(f) == {"heading", "powerTicks", "pelletsLeft", "lives", "options"}
    for opt in f["options"].values():
        assert set(opt) == {"pelletDistance", "pelletsWithin8", "deadEnd", "nearestGhost"}


def test_only_legal_directions_and_single_source(junction):
    f = extract(junction)
    assert list(f["options"]) == legal_directions(junction)
    corner = make_state(1, 1)
    assert set(extract(corner)["options"]) == {"DOWN", "RIGHT"}
    assert set(extract(corner)["options"]) <= set(DIRECTIONS)


def test_ghost_distance_is_per_direction(junction):
    opts = extract(junction)["options"]
    assert opts["RIGHT"]["nearestGhost"]["distance"] < opts["LEFT"]["nearestGhost"]["distance"]
    assert opts["RIGHT"]["nearestGhost"]["name"] == "blinky"


def test_ghost_in_house_is_unreachable():
    f = extract(make_state(12, 5, ghosts=[ghost("pinky", 13, 14)]))
    assert all(o["nearestGhost"] is None for o in f["options"].values())


def test_no_grid_and_compact():
    ghosts = [ghost(n, 15 + i, 5) for i, n in enumerate(["blinky", "pinky", "inky", "clyde"])]
    text = json.dumps(extract(make_state(6, 5, ghosts=ghosts)), separators=(",", ":"))
    assert "grid" not in text and "#" not in text
    assert len(text) / 4 < 400  # ~4 chars per token
