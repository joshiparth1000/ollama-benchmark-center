from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = Field(default="development", validation_alias="APP_ENV")
    database_url: str = Field(
        default="postgresql+asyncpg://ollama_bench:ollama_bench@postgres:5432/ollama_bench",
        validation_alias="BACKEND_DATABASE_URL",
    )
    backend_api_key: str = Field(default="dev-backend-key", validation_alias="BACKEND_API_KEY")
    require_api_key: bool = Field(default=False, validation_alias="BACKEND_REQUIRE_API_KEY")
    bench_agent_api_key: str = Field(default="dev-agent-key", validation_alias="BENCH_AGENT_API_KEY")
    cors_origins: str = Field(default="http://localhost:3000", validation_alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
