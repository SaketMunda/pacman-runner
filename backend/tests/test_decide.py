"""One test per rung of the degradation ladder in error-handling.md. No live API calls --
jev_client.call_jev is monkeypatched to return canned JevSuccess/JevError values so decide()
itself (validation + rung selection) is what's under test.
"""

import httpx
import pytest

from app.config import Settings
from app.decide import decide
from app.jev_client import JevError, JevSuccess
from tests.conftest import make_state


def make_settings(mode="live") -> Settings:
    return Settings(_env_file=None, openrouter_api_key="sk-or-v1-test", jev_mode=mode)


@pytest.fixture
async def http_client():
    async with httpx.AsyncClient() as client:
        yield client


def mock_call_jev(monkeypatch, result):
    async def _fake(client, settings, state, questions):
        return result

    monkeypatch.setattr("app.decide.call_jev", _fake)


async def test_rung1_stub_mode_skips_network(monkeypatch, http_client, junction):
    def _boom(*a, **kw):
        raise AssertionError("stub mode must never call the network")

    monkeypatch.setattr("app.decide.call_jev", _boom)
    out = await decide(junction, http_client, make_settings(mode="stub"))
    assert out.source == "stub"


async def test_rung2_valid_answer_uses_jev(monkeypatch, http_client, junction):
    probs = {"UP": 0.6, "LEFT": 0.3, "DOWN": 0.1}
    mock_call_jev(monkeypatch, JevSuccess(
        answers={
            "move": {"type": "choice", "choice": "UP", "probabilities": probs, "confidence": 0.7},
            "aggression": {"type": "score", "score": 2.1, "confidence": 0.5},
        },
        decision_id="gen-dec-1", latency_ms=180, cost=0.00001,
    ))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "jev" and out.move == "UP" and out.move_probabilities == probs
    assert out.aggression_score == 2.1 and out.decision_id == "gen-dec-1"


async def test_rung3_timeout_falls_back_to_stub(monkeypatch, http_client, junction):
    mock_call_jev(monkeypatch, JevError("timeout", "timed out", status=None, latency_ms=1500))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "stub"


async def test_rung3_server_error_falls_back_to_stub(monkeypatch, http_client, junction):
    mock_call_jev(monkeypatch, JevError("server_error", "HTTP 500", status=500, latency_ms=200))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "stub"


async def test_rung4_auth_error_falls_back_to_stub(monkeypatch, http_client, junction):
    mock_call_jev(monkeypatch, JevError("auth_error", "HTTP 401", status=401, latency_ms=70))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "stub"


async def test_rung5_missing_move_key_falls_back_to_stub(monkeypatch, http_client, junction):
    mock_call_jev(monkeypatch, JevSuccess(
        answers={"aggression": {"type": "score", "score": 2.0, "confidence": 0.5}},
        decision_id="gen-dec-2", latency_ms=150, cost=0.00001,
    ))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "stub"


async def test_rung6_illegal_move_falls_back_to_stub(monkeypatch, http_client):
    corner = make_state(1, 1)  # legal: DOWN, RIGHT -- UP is a wall here
    mock_call_jev(monkeypatch, JevSuccess(
        answers={"move": {"type": "choice", "choice": "UP", "probabilities": {"UP": 1.0},
                           "confidence": 0.9}},
        decision_id="gen-dec-3", latency_ms=150, cost=0.00001,
    ))
    out = await decide(corner, http_client, make_settings())
    assert out.source == "stub"


async def test_rung7_bad_probabilities_keeps_jev_move_nulls_distribution(
    monkeypatch, http_client, junction
):
    mock_call_jev(monkeypatch, JevSuccess(
        answers={
            "move": {"type": "choice", "choice": "UP",
                      "probabilities": {"UP": 0.4, "LEFT": 0.2}, "confidence": 0.5},
        },
        decision_id="gen-dec-4", latency_ms=150, cost=0.00001,
    ))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "jev" and out.move == "UP" and out.move_probabilities is None


async def test_rung8_out_of_range_aggression_is_clamped(monkeypatch, http_client, junction):
    mock_call_jev(monkeypatch, JevSuccess(
        answers={
            "move": {"type": "choice", "choice": "UP",
                      "probabilities": {"UP": 0.7, "LEFT": 0.3}, "confidence": 0.6},
            "aggression": {"type": "score", "score": 7.9, "confidence": 0.5},
        },
        decision_id="gen-dec-5", latency_ms=150, cost=0.00001,
    ))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "jev" and out.aggression_score == 4.0


async def test_stay_is_a_legal_move(monkeypatch, http_client, junction):
    mock_call_jev(monkeypatch, JevSuccess(
        answers={
            "move": {"type": "choice", "choice": "STAY", "probabilities": {"STAY": 1.0},
                      "confidence": 0.9},
        },
        decision_id="gen-dec-6", latency_ms=150, cost=0.00001,
    ))
    out = await decide(junction, http_client, make_settings())
    assert out.source == "jev" and out.move == "STAY"
