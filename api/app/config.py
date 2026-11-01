from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(API_DIR.parent / ".env.db", API_DIR / ".env"), extra="ignore"
    )

    app_env: Literal["dev", "test", "prod"] = "dev"
    repository_backend: Literal["postgres", "supabase"] = "postgres"
    cors_origins: list[str] = ["http://localhost:3000"]
    database_url: SecretStr | None = None
    supabase_url: str | None = None
    supabase_publishable_key: SecretStr | None = None
    dev_auth_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
