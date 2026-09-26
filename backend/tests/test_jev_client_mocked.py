import json
from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.jev_client import JevError, JevSuccess, call_jev

SKILL_EXAMPLES = (
    Path(__file__).resolve().parents[2]
    / ".claude"
    / "skills"
    / "jev-integration-and-testing"
    / "examples"
)
REAL_RESPONSE = json.loads((SKILL_EXAMPLES / "junction-response.json").read_text())
ERROR_401 = json.loads((SKILL_EXAMPLES / "error-401.json").read_text())
REQUEST_FIXTURE = json.loads((SKILL_EXAMPLES / "junction-request.json").read_text())


def make_settings(**overrides) -> Settings:
    return Settings(
        _env_file=None,
        openrouter_api_key="sk-or-v1-test",
        openrouter_base_url="https://openrouter.ai/api/alpha",
        jev_model="~typesafe/jev-latest",
        jev_mode="live",
        jev_timeout_seconds=1.5,
        **overrides,
    )


DECISIONS_PATH = "/api/alpha/decisions"


async def _call() -> JevSuccess | JevError:
    async with httpx.AsyncClient() as client:
        return await call_jev(
            client, make_settings(), REQUEST_FIXTURE["state"], REQUEST_FIXTURE["questions"]
        )


@pytest.mark.respx(base_url="https://openrouter.ai")
async def test_success_replays_real_capture(respx_mock):
    respx_mock.post(DECISIONS_PATH).mock(return_value=httpx.Response(200, json=REAL_RESPONSE))
    result = await _call()
    assert isinstance(result, JevSuccess)
    assert result.answers["move"]["choice"] == "UP"
    assert result.decision_id == REAL_RESPONSE["id"]
    assert result.cost == REAL_RESPONSE["usage"]["cost"]


@pytest.mark.respx(base_url="https://openrouter.ai")
async def test_auth_error_replays_real_401_body(respx_mock):
    respx_mock.post(DECISIONS_PATH).mock(return_value=httpx.Response(401, json=ERROR_401))
    result = await _call()
    assert isinstance(result, JevError)
    assert result.kind == "auth_error"
    assert result.status == 401


@pytest.mark.respx(base_url="https://openrouter.ai")
async def test_rbac_403_is_auth_error(respx_mock):
    # Body as returned live on 2026-09-26 when the key lost Decisions API access.
    body = {"error": {"message": "HTTP 403: RBAC: access denied", "code": 403}}
    respx_mock.post(DECISIONS_PATH).mock(return_value=httpx.Response(403, json=body))
    result = await _call()
    assert isinstance(result, JevError)
    assert result.kind == "auth_error"
    assert result.status == 403


@pytest.mark.respx(base_url="https://openrouter.ai")
async def test_malformed_answers_is_bad_body(respx_mock):
    respx_mock.post(DECISIONS_PATH).mock(
        return_value=httpx.Response(200, json={"id": "gen-dec-x", "usage": {}})  # no 'answers'
    )
    result = await _call()
    assert isinstance(result, JevError)
    assert result.kind == "bad_body"


@pytest.mark.respx(base_url="https://openrouter.ai")
async def test_timeout_is_reported(respx_mock):
    respx_mock.post(DECISIONS_PATH).mock(side_effect=httpx.TimeoutException("timed out"))
    result = await _call()
    assert isinstance(result, JevError)
    assert result.kind == "timeout"


@pytest.mark.respx(base_url="https://openrouter.ai")
async def test_server_error_is_reported(respx_mock):
    respx_mock.post(DECISIONS_PATH).mock(return_value=httpx.Response(500, text="internal error"))
    result = await _call()
    assert isinstance(result, JevError)
    assert result.kind == "server_error"
    assert result.status == 500
