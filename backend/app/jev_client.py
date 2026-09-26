"""The HTTP call to OpenRouter's Decisions API. Owns transport, timeout, and error shaping --
never interprets game meaning (that's decide.py). Never logs the key or Authorization header.
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.config import Settings

log = logging.getLogger(__name__)

ErrorKind = Literal["timeout", "connect", "server_error", "auth_error", "client_error", "bad_body"]


@dataclass
class JevSuccess:
    answers: dict[str, Any]
    decision_id: str | None
    latency_ms: int
    cost: float | None


@dataclass
class JevError:
    kind: ErrorKind
    detail: str
    status: int | None
    latency_ms: int


JevResult = JevSuccess | JevError


def make_client(timeout_seconds: float) -> httpx.AsyncClient:
    """One shared AsyncClient, created in the FastAPI lifespan and closed on shutdown --
    connection reuse matters for latency against a ~1s deadline."""
    return httpx.AsyncClient(timeout=timeout_seconds)


async def call_jev(
    client: httpx.AsyncClient, settings: Settings, state: dict[str, Any], questions: dict[str, Any]
) -> JevResult:
    url = f"{settings.openrouter_base_url.rstrip('/')}/decisions"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    body = {"model": settings.jev_model, "state": state, "questions": questions}

    start = time.perf_counter()

    def elapsed() -> int:
        return round((time.perf_counter() - start) * 1000)

    try:
        resp = await client.post(
            url, headers=headers, json=body, timeout=settings.jev_timeout_seconds
        )
    except httpx.TimeoutException as exc:
        return JevError("timeout", str(exc), status=None, latency_ms=elapsed())
    except httpx.ConnectError as exc:
        return JevError("connect", str(exc), status=None, latency_ms=elapsed())
    except httpx.HTTPError as exc:
        return JevError("connect", str(exc), status=None, latency_ms=elapsed())

    latency_ms = elapsed()
    status = resp.status_code

    # 403 included: OpenRouter answers "RBAC: access denied" when a key loses access to the
    # alpha Decisions API (observed live 2026-09-26) -- an auth problem, not a bad request.
    if status in (401, 402, 403):
        log.error("Jev auth error %s: %s", status, _safe_body(resp))
        return JevError("auth_error", f"HTTP {status}", status=status, latency_ms=latency_ms)
    if status >= 500:
        log.warning("Jev server error %s: %s", status, _safe_body(resp))
        return JevError("server_error", f"HTTP {status}", status=status, latency_ms=latency_ms)
    if status >= 400:
        log.warning("Jev client error %s: %s", status, _safe_body(resp))
        return JevError("client_error", f"HTTP {status}", status=status, latency_ms=latency_ms)

    try:
        data = resp.json()
    except ValueError:
        log.warning("Jev returned non-JSON body")
        return JevError(
            "bad_body", "response was not valid JSON", status=status, latency_ms=latency_ms
        )

    answers = data.get("answers")
    if not isinstance(answers, dict):
        log.warning("Jev response missing 'answers': %s", _safe_body(resp))
        return JevError("bad_body", "missing answers", status=status, latency_ms=latency_ms)

    usage = data.get("usage") or {}
    return JevSuccess(
        answers=answers,
        decision_id=data.get("id"),
        latency_ms=latency_ms,
        cost=usage.get("cost"),
    )


def _safe_body(resp: httpx.Response) -> str:
    """The error body for logging -- never the key, which only ever appears in our own
    request headers, not in anything OpenRouter sends back."""
    return resp.text[:500]
