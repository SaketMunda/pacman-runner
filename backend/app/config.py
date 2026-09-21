"""Settings from backend/.env. Read once at wiring time (main.py), never inside a request."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/alpha"
    jev_model: str = "~typesafe/jev-latest"
    jev_timeout_seconds: float = 1.5
    jev_mode: Literal["stub", "live"] = "stub"
    jev_log_decisions: bool = True
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("openrouter_api_key", mode="after")
    @classmethod
    def _blank_key_is_unset(cls, v: str | None) -> str | None:
        # An untouched copy of .env.example carries the "sk-or-v1-..." placeholder.
        if v is None or not v.strip() or v.strip().endswith("..."):
            return None
        return v.strip()

    @model_validator(mode="after")
    def _live_needs_key(self) -> "Settings":
        if self.jev_mode == "live" and not self.openrouter_api_key:
            raise ValueError("JEV_MODE=live requires OPENROUTER_API_KEY to be set")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
