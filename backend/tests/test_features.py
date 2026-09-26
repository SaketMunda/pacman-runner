import json

from app.features import extract, legal_directions
from app.maze import DIRECTIONS
from tests.conftest import ghost, make_state


def test_shape(junction):
    f = extract(junction)
    assert set(f) == {"heading", "powerTicks", "pelletsLeft", "lives", "options"}
    for opt in f["options"].values():
        assert set(opt) == {"pelletDistance", "pelletsWithin8", "deadEnd", "nearestGhost"}
        if opt["nearestGhost"]:
            assert set(opt["nearestGhost"]) == {"name", "distance", "mode", "closing"}


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


def test_eaten_pellets_are_not_reported_as_present():
    # (6, 20) sits on the column-6 corridor where live play livelocked: the static layout
    # always reported a pellet one tile away, however long ago it had been eaten.
    from app.maze import MAZE

    start = make_state(6, 20, direction="DOWN")
    before = extract(start)["options"]["DOWN"]
    assert before["pelletDistance"] == 1

    eaten = sorted(MAZE.pellets)  # everything gone
    after = extract(make_state(6, 20, direction="DOWN", eaten_pellets=eaten))["options"]
    assert all(o["pelletDistance"] is None and o["pelletsWithin8"] == 0 for o in after.values())

    one_gone = extract(make_state(6, 20, direction="DOWN", eaten_pellets=[(6, 21)]))
    assert one_gone["options"]["DOWN"]["pelletsWithin8"] == before["pelletsWithin8"] - 1


def test_closing_follows_the_ghost_heading():
    # blinky sits at (15, 5), three tiles right of the (12, 5) junction.
    toward = extract(make_state(12, 5, ghosts=[{**ghost("blinky", 15, 5), "direction": "LEFT"}]))
    away = extract(make_state(12, 5, ghosts=[{**ghost("blinky", 15, 5), "direction": "RIGHT"}]))
    headless = extract(make_state(12, 5, ghosts=[{**ghost("blinky", 15, 5), "direction": None}]))
    assert toward["options"]["RIGHT"]["nearestGhost"]["closing"] is True
    assert away["options"]["RIGHT"]["nearestGhost"]["closing"] is False
    assert headless["options"]["RIGHT"]["nearestGhost"]["closing"] is False
