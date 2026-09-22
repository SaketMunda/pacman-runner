import json

from app.features import extract
from app.questions import AGGRESSION_CRITERIA, build_questions
from tests.conftest import make_state


def test_move_criteria_is_legal_directions_plus_stay(junction):
    feats = extract(junction)
    questions = build_questions(feats)
    assert set(questions["move"]["criteria"]) == set(feats["options"]) | {"STAY"}


def test_move_criteria_matches_options_key_set_exactly_for_corner():
    corner = make_state(1, 1)
    feats = extract(corner)
    questions = build_questions(feats)
    assert set(questions["move"]["criteria"]) - {"STAY"} == set(feats["options"])


def test_score_criteria_is_ordered_array():
    feats = extract(make_state(12, 5))
    questions = build_questions(feats)
    assert questions["aggression"]["criteria"] == AGGRESSION_CRITERIA
    assert isinstance(questions["aggression"]["criteria"], list)


def test_questions_have_required_shape(junction):
    questions = build_questions(extract(junction))
    assert questions["move"]["type"] == "choice"
    assert questions["aggression"]["type"] == "score"
    assert questions["move"]["instructions"]
    assert questions["aggression"]["instructions"]


def test_state_stays_under_budget(junction):
    # The `state` payload -- not the questions/rubric text -- is the part that must stay
    # compact per the skill's "well under 400 tokens" rule; rubric prose is comparatively
    # large but fixed cost, not per-junction bloat.
    feats = extract(junction)
    text = json.dumps(feats, separators=(",", ":"))
    assert len(text) / 4 < 400  # ~4 chars per token
