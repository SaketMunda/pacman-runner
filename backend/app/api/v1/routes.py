import logging
import time

from fastapi import APIRouter, Request

from app.config import get_settings
from app.decide import decide
from app.models import GameStateIn, JevMoveOut

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/jev-move", response_model=JevMoveOut)
async def jev_move(state: GameStateIn, request: Request) -> JevMoveOut:
    settings = get_settings()
    start = time.perf_counter()
    out = await decide(state, request.app.state.http_client, settings)
    if out.latency_ms is None:
        out.latency_ms = round((time.perf_counter() - start) * 1000)
    log.debug("%s decision %s -> %s", out.source, state.junction_id, out.move)
    return out


@router.get("/health")
async def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "status": "ok",
        "mode": settings.jev_mode,
        "model": settings.jev_model,
        "keyConfigured": settings.openrouter_api_key is not None,
    }
