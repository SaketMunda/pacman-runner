import logging
import time

from fastapi import APIRouter

from app.config import get_settings
from app.models import GameStateIn, JevMoveOut
from app.stub import decide_stub

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/jev-move", response_model=JevMoveOut)
async def jev_move(state: GameStateIn) -> JevMoveOut:
    # Phase 2: stub only. Phase 5 replaces this call with decide.py, which owns the ladder.
    start = time.perf_counter()
    out = decide_stub(state)
    out.latency_ms = round((time.perf_counter() - start) * 1000)
    log.debug("stub decision %s -> %s", state.junction_id, out.move)
    return out


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "mode": get_settings().jev_mode}
