from typing import Any

import httpx

from app.core.config import get_settings


class AgentClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"x-api-key": get_settings().bench_agent_api_key}

    async def get_health(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{self.base_url}/health", headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_hardware(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{self.base_url}/hardware", headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_models(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{self.base_url}/ollama/models", headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def start_benchmark(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{self.base_url}/benchmark", json=payload, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def get_benchmark(self, benchmark_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{self.base_url}/benchmark/{benchmark_id}", headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def cancel_benchmark(self, benchmark_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{self.base_url}/benchmark/{benchmark_id}/cancel", headers=self.headers)
            response.raise_for_status()
            return response.json()
