from fastapi import Header, HTTPException

from app.core.config import get_settings


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if x_api_key != get_settings().bench_agent_api_key:
        raise HTTPException(status_code=401, detail="Invalid agent API key")
