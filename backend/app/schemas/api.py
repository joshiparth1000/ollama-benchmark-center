from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class HealthResponse(BaseModel):
    status: str
    service: str


class HostCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    agent_url: HttpUrl


class HostUpdate(BaseModel):
    name: str | None = None
    agent_url: HttpUrl | None = None
    status: str | None = None


class HostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    agent_url: str
    status: str
    created_at: datetime
    updated_at: datetime


class BenchmarkConfig(BaseModel):
    num_gpu: int = 0
    num_thread: int = 4
    num_ctx: int = 4096
    num_batch: int = 512
    num_predict: int = 128
    temperature: float = 0.2


class BenchmarkRunCreate(BaseModel):
    host_id: str
    model: str
    mode: Literal["quick", "balanced", "exhaustive", "custom"] = "quick"
    prompt: str = "Explain why benchmark measurements should include latency and throughput."
    matrix: list[BenchmarkConfig] | None = None


class BenchmarkRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    host_id: str
    model: str
    mode: str
    prompt: str
    status: str
    agent_benchmark_id: str | None
    current_config: dict[str, Any] | None = None
    progress: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class BenchmarkResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    config: dict[str, Any]
    metrics: dict[str, Any]
    status: str
    error: str | None
    gen_tps: float | None
    latency_seconds: float | None
    max_vram_used_mb: float | None
    created_at: datetime


class HardwareSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    host_id: str
    payload: dict[str, Any]
    created_at: datetime


class RecommendationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    config: dict[str, Any]
    metrics: dict[str, Any]
    reason: str
    details: dict[str, Any] = Field(default_factory=dict)


class ExportRead(BaseModel):
    kind: str
    content: str
