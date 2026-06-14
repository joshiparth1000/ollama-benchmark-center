import asyncio
import uuid
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from app.services.hardware import resource_sample
from app.services.ollama import generate


@dataclass
class BenchmarkState:
    benchmark_id: str
    status: str
    model: str
    prompt: str
    results: list[dict[str, Any]] = field(default_factory=list)
    current_config: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    task: asyncio.Task[None] | None = None


RUNS: dict[str, BenchmarkState] = {}


def default_matrix(mode: str) -> list[dict[str, Any]]:
    base = {"num_gpu": 0, "num_thread": 4, "num_ctx": 4096, "num_batch": 512, "temperature": 0.2}
    if mode == "balanced":
        return [base | {"num_predict": 256}, base | {"num_thread": 8, "num_predict": 256}]
    if mode == "exhaustive":
        return [
            base | {"num_predict": 512},
            base | {"num_thread": 8, "num_predict": 512},
            base | {"num_thread": 12, "num_batch": 1024, "num_predict": 512},
        ]
    return [base | {"num_predict": 128}]


def compute_metrics(response: dict[str, Any], sample: dict[str, Any], started: float) -> dict[str, Any]:
    total_duration = response.get("total_duration") or 0
    prompt_eval_count = response.get("prompt_eval_count") or 0
    prompt_eval_duration = response.get("prompt_eval_duration") or 0
    eval_count = response.get("eval_count") or 0
    eval_duration = response.get("eval_duration") or 0
    total_sec = total_duration / 1_000_000_000 if total_duration else perf_counter() - started
    prompt_sec = prompt_eval_duration / 1_000_000_000 if prompt_eval_duration else 0
    eval_sec = eval_duration / 1_000_000_000 if eval_duration else 0
    return {
        "total_sec": total_sec,
        "load_sec": (response.get("load_duration") or 0) / 1_000_000_000,
        "prompt_tps": prompt_eval_count / prompt_sec if prompt_sec else 0,
        "gen_tps": eval_count / eval_sec if eval_sec else 0,
        "output_tokens": eval_count,
        **sample,
    }


async def run_benchmark(state: BenchmarkState, matrix: list[dict[str, Any]]) -> None:
    state.status = "running"
    try:
        for config in matrix:
            if state.cancel_requested:
                state.status = "cancelled"
                return
            state.current_config = config
            sample = resource_sample()
            started = perf_counter()
            payload = {
                "model": state.model,
                "prompt": state.prompt,
                "stream": False,
                "options": config,
            }
            try:
                response = await generate(payload)
                state.results.append(
                    {
                        "config": config,
                        "metrics": compute_metrics(response, sample, started),
                        "status": "completed",
                    }
                )
            except Exception as exc:  # pragma: no cover - external service failure shape varies
                if state.cancel_requested:
                    state.status = "cancelled"
                    return
                state.results.append({"config": config, "metrics": sample, "status": "failed", "error": str(exc)})
        if state.cancel_requested:
            state.status = "cancelled"
            return
        state.status = "completed"
    except asyncio.CancelledError:
        state.status = "cancelled"
        raise
    except Exception as exc:  # pragma: no cover
        state.status = "failed"
        state.error = str(exc)


def start_benchmark(payload: dict[str, Any]) -> BenchmarkState:
    benchmark_id = str(uuid.uuid4())
    matrix = payload.get("matrix") or default_matrix(payload.get("mode", "quick"))
    state = BenchmarkState(
        benchmark_id=benchmark_id,
        status="queued",
        model=payload["model"],
        prompt=payload["prompt"],
    )
    RUNS[benchmark_id] = state
    state.task = asyncio.create_task(run_benchmark(state, matrix))
    return state


def cancel_benchmark_run(benchmark_id: str) -> BenchmarkState | None:
    state = RUNS.get(benchmark_id)
    if not state:
        return None
    state.cancel_requested = True
    state.status = "cancelled"
    if state.task and not state.task.done():
        state.task.cancel()
    return state
