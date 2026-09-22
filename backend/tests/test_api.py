import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

# Entered once for the module: triggers the lifespan startup that sets
# app.state.http_client, which the /jev-move route always reads.
_client_ctx = TestClient(app)
client = _client_ctx.__enter__()

BODY = {
    "mazeId": "classic-28x31", "tick": 412, "position": {"x": 12, "y": 5}, "direction": "LEFT",
    "junctionId": "12,5@412",
    "ghosts": [{"name": "blinky", "position": {"x": 15, "y": 5}, "mode": "chase",
                "direction": "LEFT"}],
    "powerTicksRemaining": 0, "pelletsRemaining": 173, "lives": 3, "score": 710,
}


def test_round_trip_camel_case():
    r = client.post("/api/v1/jev-move", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "stub" and data["junctionId"] == "12,5@412"
    assert {"moveProbabilities", "aggressionScore", "latencyMs", "decisionId"} <= set(data)
    assert not any("_" in k for k in data)


def test_unknown_ghost_mode_still_200():
    body = {**BODY, "ghosts": [{**BODY["ghosts"][0], "mode": "mystery"}]}
    assert client.post("/api/v1/jev-move", json=body).status_code == 200


def test_malformed_body_is_422():
    assert client.post("/api/v1/jev-move", json={"tick": 1}).status_code == 422


def test_health():
    data = client.get("/api/v1/health").json()
    assert data["status"] == "ok" and data["mode"] == "stub"
    assert "model" in data and isinstance(data["keyConfigured"], bool)


def test_cors_allows_vite_origin():
    r = client.options("/api/v1/jev-move", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_live_without_key_fails_fast():
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        Settings(_env_file=None, jev_mode="live", openrouter_api_key="sk-or-v1-...")


def test_cors_origins_comma_separated(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://a:1, http://b:2")
    assert Settings(_env_file=None).cors_origins == ["http://a:1", "http://b:2"]
