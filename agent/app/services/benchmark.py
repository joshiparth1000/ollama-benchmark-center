import asyncio
import re
import uuid
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from app.services.hardware import hardware_snapshot
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


def safe_thread_counts(hardware: dict[str, Any]) -> list[int]:
    cpu = hardware.get("cpu") or {}
    logical_count = int(cpu.get("logical_count") or 0)
    usable_threads = max(1, logical_count - 1) if logical_count else 8
    candidates = [4, 8, 12, usable_threads]
    return sorted({max(1, min(candidate, usable_threads)) for candidate in candidates})


def model_size_billion(model: str | None) -> float | None:
    if not model:
        return None
    match = re.search(r"(?<![\d.])(\d+(?:\.\d+)?)\s*b\b", model, flags=re.IGNORECASE)
    return float(match.group(1)) if match else None


def max_gpu_vram_mb(hardware: dict[str, Any]) -> float:
    gpus = hardware.get("gpus") or []
    return max((float(gpu.get("vram_total_mb") or 0) for gpu in gpus), default=0)


def hardware_context_cap(
    model: str | None,
    gpu_available: bool,
    hardware: dict[str, Any],
) -> int:
    size_b = model_size_billion(model)
    if not gpu_available:
        return 8192
    vram_mb = max_gpu_vram_mb(hardware)
    if size_b is None:
        return 8192 if vram_mb < 16384 else 16384
    if size_b <= 8:
        if vram_mb >= 10240:
            return 65536
        if vram_mb >= 8192:
            return 32768
        return 16384
    if size_b <= 14:
        if vram_mb >= 24576:
            return 65536
        if vram_mb >= 16384:
            return 32768
        if vram_mb >= 10240:
            return 16384
        return 8192
    if size_b <= 32:
        if vram_mb >= 49152:
            return 65536
        if vram_mb >= 24576:
            return 32768
        if vram_mb >= 16384:
            return 16384
        return 8192
    if vram_mb >= 49152:
        return 16384
    return 4096


def context_windows(
    model: str | None,
    mode: str,
    gpu_available: bool,
    hardware: dict[str, Any],
) -> list[int]:
    size_b = model_size_billion(model)
    cap = min(65536, hardware_context_cap(model, gpu_available, hardware))
    windows = [window for window in [4096, 8192, 16384, 32768, 65536] if window <= cap]
    if not windows:
        windows = [4096]
    if mode == "quick":
        return windows[:2]
    if mode == "balanced":
        return windows[:4] if size_b is not None and size_b <= 8 else windows[:3]
    return windows


def default_matrix(mode: str, model: str | None = None) -> list[dict[str, Any]]:
    hardware = hardware_snapshot()
    thread_counts = safe_thread_counts(hardware)
    gpu_available = bool(hardware.get("gpus"))
    contexts = context_windows(model, mode, gpu_available, hardware)
    base = {"num_batch": 512, "temperature": 0.2}

    def config(num_gpu: int, num_thread: int, num_predict: int, **overrides: Any) -> dict[str, Any]:
        return base | {"num_gpu": num_gpu, "num_thread": num_thread, "num_predict": num_predict} | overrides

    def limited_threads(limit: int) -> list[int]:
        return thread_counts[:limit]

    def matrix_for(
        num_gpu: int,
        threads: list[int],
        num_predict: int,
        batch_1024_on_largest: bool = False,
    ) -> list[dict[str, Any]]:
        rows = []
        for num_ctx in contexts:
            for index, thread in enumerate(threads):
                use_large_batch = (
                    batch_1024_on_largest
                    and num_ctx == contexts[-1]
                    and index == len(threads) - 1
                )
                rows.append(
                    config(
                        num_gpu,
                        thread,
                        num_predict,
                        num_ctx=num_ctx,
                        **({"num_batch": 1024} if use_large_batch else {}),
                    )
                )
        return rows

    if gpu_available:
        if mode == "balanced":
            return matrix_for(-1, limited_threads(3), 256)
        if mode == "exhaustive":
            return matrix_for(-1, thread_counts, 512, batch_1024_on_largest=True)
        return matrix_for(-1, limited_threads(2), 128)
    if mode == "balanced":
        return matrix_for(0, limited_threads(3), 256)
    if mode == "exhaustive":
        return matrix_for(0, thread_counts, 512)
    return matrix_for(0, limited_threads(2), 128)


def compute_metrics(response: dict[str, Any], sample: dict[str, Any], started: float) -> dict[str, Any]:
    total_duration = response.get("total_duration") or 0
    prompt_eval_count = response.get("prompt_eval_count") or 0
    prompt_eval_duration = response.get("prompt_eval_duration") or 0
    eval_count = response.get("eval_count") or 0
    eval_duration = response.get("eval_duration") or 0
    total_sec = total_duration / 1_000_000_000 if total_duration else perf_counter() - started
    load_sec = (response.get("load_duration") or 0) / 1_000_000_000
    prompt_sec = prompt_eval_duration / 1_000_000_000 if prompt_eval_duration else 0
    eval_sec = eval_duration / 1_000_000_000 if eval_duration else 0
    return {
        "total_sec": total_sec,
        "load_sec": load_sec,
        "prompt_eval_sec": prompt_sec,
        "ttft_sec": load_sec + prompt_sec if (load_sec or prompt_sec) else total_sec,
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
    matrix = payload.get("matrix") or default_matrix(payload.get("mode", "quick"), payload.get("model"))
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
