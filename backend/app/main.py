from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import router
from app.config import get_settings
from app.jev_client import make_client

settings = get_settings()  # raises here (startup) if JEV_MODE=live without a key


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One shared AsyncClient for the app's lifetime -- connection reuse matters for
    # latency against a ~1s deadline.
    async with make_client(settings.jev_timeout_seconds) as client:
        app.state.http_client = client
        yield


app = FastAPI(title="Jev Pac-Runner backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api/v1")
