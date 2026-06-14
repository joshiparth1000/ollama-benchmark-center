import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_backend_api_key
from app.db.session import get_session
from app.repositories.benchmarks import BenchmarkRepository
from app.repositories.hosts import HostRepository
from app.schemas.api import (
    BenchmarkRunCreate,
    BenchmarkRunRead,
    ExportRead,
    HardwareSnapshotRead,
    HealthResponse,
    HostCreate,
    HostRead,
    HostUpdate,
    RecommendationRead,
)
from app.services.agent_client import AgentClient
from app.services.exports import render_export
from app.services.recommendations import choose_recommendation

router = APIRouter()
api_router = APIRouter(prefix="/api", dependencies=[Depends(require_backend_api_key)])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="backend")


@router.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@api_router.get("/hosts", response_model=list[HostRead])
async def list_hosts(session: AsyncSession = Depends(get_session)) -> list:
    return await HostRepository(session).list()


@api_router.post("/hosts", response_model=HostRead)
async def create_host(payload: HostCreate, session: AsyncSession = Depends(get_session)):
    return await HostRepository(session).create(payload)


@api_router.get("/hosts/{host_id}", response_model=HostRead)
async def get_host(host_id: str, session: AsyncSession = Depends(get_session)):
    host = await HostRepository(session).get(host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    return host


@api_router.patch("/hosts/{host_id}", response_model=HostRead)
async def update_host(host_id: str, payload: HostUpdate, session: AsyncSession = Depends(get_session)):
    repo = HostRepository(session)
    host = await repo.get(host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    return await repo.update(host, payload)


@api_router.delete("/hosts/{host_id}", status_code=204)
async def delete_host(host_id: str, session: AsyncSession = Depends(get_session)) -> None:
    repo = HostRepository(session)
    host = await repo.get(host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    await repo.delete(host)


@api_router.post("/hosts/{host_id}/refresh", response_model=HardwareSnapshotRead)
async def refresh_host(host_id: str, session: AsyncSession = Depends(get_session)):
    repo = HostRepository(session)
    host = await repo.get(host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    hardware = await AgentClient(host.agent_url).get_hardware()
    await repo.update(host, HostUpdate(status="online"))
    return await repo.add_snapshot(host_id, hardware)


@api_router.get("/hosts/{host_id}/hardware")
async def get_hardware(host_id: str, session: AsyncSession = Depends(get_session)):
    host = await HostRepository(session).get(host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    return await AgentClient(host.agent_url).get_hardware()


@api_router.get("/hosts/{host_id}/models")
async def get_models(host_id: str, session: AsyncSession = Depends(get_session)):
    host = await HostRepository(session).get(host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    return await AgentClient(host.agent_url).get_models()


@api_router.post("/benchmark-runs", response_model=BenchmarkRunRead)
async def create_benchmark_run(payload: BenchmarkRunCreate, session: AsyncSession = Depends(get_session)):
    host = await HostRepository(session).get(payload.host_id)
    if not host:
        raise HTTPException(404, "Host not found")
    repo = BenchmarkRepository(session)
    run = await repo.create_run(payload)
    matrix = [item.model_dump() for item in payload.matrix] if payload.matrix else None
    try:
        agent_run = await AgentClient(host.agent_url).start_benchmark(
            {"model": payload.model, "mode": payload.mode, "prompt": payload.prompt, "matrix": matrix}
        )
    except httpx.HTTPError as exc:
        await repo.update_run(run, status="failed")
        raise HTTPException(502, f"Agent failed to start benchmark: {exc}") from exc
    return await repo.update_run(run, status="running", agent_benchmark_id=agent_run["benchmark_id"])


@api_router.get("/benchmark-runs", response_model=list[BenchmarkRunRead])
async def list_benchmark_runs(session: AsyncSession = Depends(get_session)):
    return await BenchmarkRepository(session).list_runs()


@api_router.get("/benchmark-runs/{run_id}", response_model=BenchmarkRunRead)
async def get_benchmark_run(run_id: str, session: AsyncSession = Depends(get_session)):
    repo = BenchmarkRepository(session)
    run = await repo.get_run(run_id)
    if not run:
        raise HTTPException(404, "Benchmark run not found")
    if run.agent_benchmark_id and run.status in {"queued", "running"}:
        host = await HostRepository(session).get(run.host_id)
        if host:
            agent_run = await AgentClient(host.agent_url).get_benchmark(run.agent_benchmark_id)
            run = await repo.update_run(run, status=agent_run.get("status", run.status))
            if run.status in {"completed", "failed", "cancelled"} and agent_run.get("results"):
                await repo.replace_results(run.id, agent_run["results"])
    return run


@api_router.post("/benchmark-runs/{run_id}/cancel", response_model=BenchmarkRunRead)
async def cancel_benchmark_run(run_id: str, session: AsyncSession = Depends(get_session)):
    repo = BenchmarkRepository(session)
    run = await repo.get_run(run_id)
    if not run:
        raise HTTPException(404, "Benchmark run not found")
    host = await HostRepository(session).get(run.host_id)
    if host and run.agent_benchmark_id:
        await AgentClient(host.agent_url).cancel_benchmark(run.agent_benchmark_id)
    return await repo.update_run(run, status="cancelled")


@api_router.get("/benchmark-runs/{run_id}/recommendation", response_model=RecommendationRead)
async def get_recommendation(run_id: str, session: AsyncSession = Depends(get_session)):
    repo = BenchmarkRepository(session)
    existing = await repo.get_recommendation(run_id)
    if existing:
        return existing
    results = await repo.list_results(run_id)
    try:
        config, metrics, reason = choose_recommendation(results)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return await repo.save_recommendation(run_id, config, metrics, reason)


@api_router.get("/benchmark-runs/{run_id}/export/{kind}", response_model=ExportRead)
async def export_run(kind: str, run_id: str, session: AsyncSession = Depends(get_session)):
    allowed = {"ollama", "modelfile", "llamacpp", "docker-compose", "kubernetes", "helm-values"}
    if kind not in allowed:
        raise HTTPException(404, "Unsupported export kind")
    repo = BenchmarkRepository(session)
    run = await repo.get_run(run_id)
    if not run:
        raise HTTPException(404, "Benchmark run not found")
    recommendation = await repo.get_recommendation(run_id)
    if not recommendation:
        results = await repo.list_results(run_id)
        config, metrics, reason = choose_recommendation(results)
        recommendation = await repo.save_recommendation(run_id, config, metrics, reason)
    content = render_export(kind, run.model, recommendation.config)
    await repo.save_export(run_id, kind, content)
    return ExportRead(kind=kind, content=content)


router.include_router(api_router)
