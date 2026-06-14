from fastapi import Header, HTTPException

from app.core.config import get_settings


async def require_backend_api_key(x_api_key: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.require_api_key:
        return
    if x_api_key != settings.backend_api_key:
        raise HTTPException(status_code=401, detail="Invalid backend API key")
