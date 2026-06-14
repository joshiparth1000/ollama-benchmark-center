from fastapi import Depends, FastAPI, HTTPException, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.core.auth import require_api_key
from app.services.benchmark import RUNS, start_benchmark
from app.services.hardware import hardware_snapshot
from app.services.ollama import list_models, running_models, version

app = FastAPI(title="Ollama Benchmark Center Agent", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/hardware", dependencies=[Depends(require_api_key)])
async def hardware() -> dict:
    return hardware_snapshot()


@app.get("/ollama/models", dependencies=[Depends(require_api_key)])
async def ollama_models() -> dict:
    return await list_models()


@app.get("/ollama/version", dependencies=[Depends(require_api_key)])
async def ollama_version() -> dict:
    return await version()


@app.get("/ollama/running", dependencies=[Depends(require_api_key)])
async def ollama_running() -> dict:
    return await running_models()


@app.post("/benchmark", dependencies=[Depends(require_api_key)])
async def benchmark(payload: dict) -> dict:
    state = start_benchmark(payload)
    return {"benchmark_id": state.benchmark_id, "status": state.status}


@app.get("/benchmark/{benchmark_id}", dependencies=[Depends(require_api_key)])
async def get_benchmark(benchmark_id: str) -> dict:
    state = RUNS.get(benchmark_id)
    if not state:
        raise HTTPException(404, "Benchmark not found")
    return {
        "benchmark_id": state.benchmark_id,
        "status": state.status,
        "model": state.model,
        "prompt": state.prompt,
        "current_config": state.current_config,
        "results": state.results,
        "error": state.error,
    }


@app.post("/benchmark/{benchmark_id}/cancel", dependencies=[Depends(require_api_key)])
async def cancel_benchmark(benchmark_id: str) -> dict:
    state = RUNS.get(benchmark_id)
    if not state:
        raise HTTPException(404, "Benchmark not found")
    state.cancel_requested = True
    state.status = "cancelled"
    return {"benchmark_id": benchmark_id, "status": state.status}
