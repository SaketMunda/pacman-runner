import pytest

from app.stub import decide_stub
from tests.conftest import ghost, make_state


def test_deterministic(junction):
    first = decide_stub(junction)
    for _ in range(50):
        assert decide_stub(junction) == first


def test_distribution_is_normalised_and_legal(junction):
    out = decide_stub(junction)
    assert out.source == "stub"
    assert sum(out.move_probabilities.values()) == pytest.approx(1.0, abs=1e-9)
    assert out.move in out.move_probabilities
    assert set(out.move_probabilities) <= {"UP", "DOWN", "LEFT", "RIGHT"}
    assert max(out.move_probabilities.values()) < 1.0  # not a one-hot
    assert 0 <= out.aggression_score <= 4


def test_flees_chasing_ghost_and_hunts_when_powered():
    ghosts = [ghost("blinky", 9, 5)]  # three tiles to the left
    scared = decide_stub(make_state(12, 5, ghosts=ghosts))
    powered = decide_stub(make_state(12, 5, ghosts=ghosts, power=40))
    assert scared.move_probabilities["LEFT"] < powered.move_probabilities["LEFT"]
    assert scared.aggression_score < powered.aggression_score


def test_off_maze_position_still_answers():
    out = decide_stub(make_state(0, 0))
    assert out.move == "STAY" and out.move_probabilities is None
