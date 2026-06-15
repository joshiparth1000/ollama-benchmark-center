from typing import Any


def safe_thread_counts(hardware: dict[str, Any] | None = None) -> list[int]:
    cpu = (hardware or {}).get("cpu") or {}
    logical_count = int(cpu.get("logical_count") or 0)
    usable_threads = max(1, logical_count - 1) if logical_count else 8
    candidates = [4, 8, 12, usable_threads]
    return sorted({max(1, min(candidate, usable_threads)) for candidate in candidates})


def build_matrix(
    mode: str,
    gpu_available: bool,
    hardware: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    thread_counts = safe_thread_counts(hardware)
    base = {"num_ctx": 4096, "num_batch": 512, "temperature": 0.2}

    def config(num_gpu: int, num_thread: int, num_predict: int, **overrides: Any) -> dict[str, Any]:
        return base | {"num_gpu": num_gpu, "num_thread": num_thread, "num_predict": num_predict} | overrides

    def limited_threads(limit: int) -> list[int]:
        return thread_counts[:limit]

    if gpu_available:
        if mode == "balanced":
            return [config(-1, thread, 256) for thread in limited_threads(3)]
        if mode == "exhaustive":
            return [
                config(-1, thread, 512, **({"num_batch": 1024} if index == len(thread_counts) - 1 else {}))
                for index, thread in enumerate(thread_counts)
            ]
        return [config(-1, thread, 128) for thread in limited_threads(2)]

    if mode == "balanced":
        return [config(0, thread, 256) for thread in limited_threads(3)]

    if mode == "exhaustive":
        return [config(0, thread, 512) for thread in thread_counts]

    return [config(0, thread, 128) for thread in limited_threads(2)]
