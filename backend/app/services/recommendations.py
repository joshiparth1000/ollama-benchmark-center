from app.models.entities import BenchmarkResult


def choose_recommendation(results: list[BenchmarkResult]) -> tuple[dict, dict, str]:
    candidates = [r for r in results if r.status == "completed" and r.gen_tps is not None]
    if not candidates:
        raise ValueError("No successful benchmark results are available.")

    def score(row: BenchmarkResult) -> tuple[float, float, float, int]:
        metrics = row.metrics or {}
        config = row.config or {}
        gen_tps = float(metrics.get("gen_tps") or 0)
        vram = float(metrics.get("max_vram_used_mb") or 0)
        latency = float(metrics.get("total_sec") or 0)
        num_gpu = int(config.get("num_gpu") or 0)
        return (gen_tps, -vram, -latency, -num_gpu)

    viable = []
    for row in candidates:
        metrics = row.metrics or {}
        total = metrics.get("gpu_vram_total_mb")
        used = metrics.get("max_vram_used_mb")
        if total and used and float(used) > float(total) * 0.95:
            continue
        viable.append(row)
    selected = max(viable or candidates, key=score)
    reason = (
        "Selected because it had the best stable generation throughput while staying within "
        "the VRAM safety limit and preserving lower latency where throughput was close."
    )
    return selected.config, selected.metrics, reason
