import json
from dataclasses import dataclass

from app.models.entities import BenchmarkResult


@dataclass
class RecommendationCandidate:
    config: dict
    metrics: dict


def choose_recommendation(results: list[BenchmarkResult]) -> tuple[dict, dict, str]:
    candidates = [r for r in results if r.status == "completed" and r.gen_tps is not None]
    if not candidates:
        raise ValueError("No successful benchmark results are available.")

    grouped: dict[str, list[BenchmarkResult]] = {}
    for row in candidates:
        key = json.dumps(row.config or {}, sort_keys=True)
        grouped.setdefault(key, []).append(row)

    averaged = []
    for rows in grouped.values():
        config = rows[0].config or {}
        metric_names = {
            name
            for row in rows
            for name, value in (row.metrics or {}).items()
            if isinstance(value, int | float)
        }
        metrics = {
            name: sum(float((row.metrics or {}).get(name) or 0) for row in rows) / len(rows)
            for name in metric_names
        }
        averaged.append(RecommendationCandidate(config=config, metrics=metrics))

    def gen_tps(row: RecommendationCandidate) -> float:
        return float(row.metrics.get("gen_tps") or 0)

    def stability_score(row: RecommendationCandidate) -> tuple[float, float, int, float]:
        metrics = row.metrics
        config = row.config
        vram = float(metrics.get("max_vram_used_mb") or 0)
        latency = float(metrics.get("total_sec") or 0)
        num_gpu = int(config.get("num_gpu") or 0)
        return (vram, latency, num_gpu, -gen_tps(row))

    viable = []
    for row in averaged:
        metrics = row.metrics
        total = metrics.get("gpu_vram_total_mb")
        used = metrics.get("max_vram_used_mb")
        if total and used and float(used) > float(total) * 0.95:
            continue
        viable.append(row)
    pool = viable or averaged
    best_tps = max(gen_tps(row) for row in pool)
    close_to_best = [row for row in pool if gen_tps(row) >= best_tps * 0.95]
    selected = min(close_to_best, key=stability_score) if len(close_to_best) > 1 else max(pool, key=gen_tps)
    reason = (
        "Selected because it had the best stable generation throughput while staying within "
        "the VRAM safety limit and preserving lower latency where throughput was close."
    )
    return selected.config, selected.metrics, reason
