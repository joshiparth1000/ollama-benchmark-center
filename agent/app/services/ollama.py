from typing import Any

import httpx

from app.core.config import get_settings


async def ollama_get(path: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(f"{get_settings().ollama_base_url}{path}")
        response.raise_for_status()
        return response.json()


async def list_models() -> dict[str, Any]:
    return await ollama_get("/api/tags")


async def version() -> dict[str, Any]:
    return await ollama_get("/api/version")


async def running_models() -> dict[str, Any]:
    return await ollama_get("/api/ps")


async def generate(payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(f"{get_settings().ollama_base_url}/api/generate", json=payload)
        response.raise_for_status()
        return response.json()
