import re
from typing import Any


def safe_thread_counts(hardware: dict[str, Any] | None = None) -> list[int]:
    cpu = (hardware or {}).get("cpu") or {}
    logical_count = int(cpu.get("logical_count") or 0)
    usable_threads = max(1, logical_count - 1) if logical_count else 8
    candidates = [4, 8, 12, usable_threads]
    return sorted({max(1, min(candidate, usable_threads)) for candidate in candidates})


def model_size_billion(model: str | None) -> float | None:
    if not model:
        return None
    match = re.search(r"(?<![\d.])(\d+(?:\.\d+)?)\s*b\b", model, flags=re.IGNORECASE)
    return float(match.group(1)) if match else None


def max_gpu_vram_mb(hardware: dict[str, Any] | None = None) -> float:
    gpus = (hardware or {}).get("gpus") or []
    return max((float(gpu.get("vram_total_mb") or 0) for gpu in gpus), default=0)


def hardware_context_cap(
    model: str | None,
    gpu_available: bool,
    hardware: dict[str, Any] | None = None,
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
    hardware: dict[str, Any] | None = None,
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


def build_matrix(
    mode: str,
    gpu_available: bool,
    hardware: dict[str, Any] | None = None,
    model: str | None = None,
) -> list[dict[str, Any]]:
    thread_counts = safe_thread_counts(hardware)
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
