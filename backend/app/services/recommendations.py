import json
from dataclasses import dataclass
from typing import Any

from app.models.entities import BenchmarkResult


@dataclass
class RecommendationCandidate:
    config: dict[str, Any]
    metrics: dict[str, Any]


@dataclass
class RecommendationDetails:
    best_for: str
    not_ideal_for: list[str]
    examples: list[dict[str, str]]
    summary: str


def _tier_from_candidate(candidate: RecommendationCandidate) -> str:
    config = candidate.config
    metrics = candidate.metrics
    num_gpu = int(config.get("num_gpu") or 0)
    gpu_vram_total_mb = float(metrics.get("gpu_vram_total_mb") or 0)
    max_vram_used_mb = float(metrics.get("max_vram_used_mb") or 0)
    gen_tps = float(metrics.get("gen_tps") or 0)
    num_predict = int(config.get("num_predict") or 0)
    num_batch = int(config.get("num_batch") or 0)

    if num_gpu <= 0 or gpu_vram_total_mb <= 0:
        return "light"
    if gen_tps >= 20 or num_predict >= 256 or num_batch >= 1024 or max_vram_used_mb >= gpu_vram_total_mb * 0.55:
        return "strong"
    return "balanced"


def _narrative_for_tier(tier: str, candidate: RecommendationCandidate) -> RecommendationDetails:
    if tier == "light":
        return RecommendationDetails(
            best_for="Simple chat, short Q&A, cleanup, and lightweight extraction jobs.",
            not_ideal_for=[
                "Long-context RAG or document search over big files.",
                "Coding copilots that need fast back-and-forth suggestions.",
                "Multi-step agent workflows that call tools repeatedly.",
            ],
            examples=[
                {
                    "task": "Answer a short customer question",
                    "fit": "Good fit",
                    "why": "Fast enough for brief prompts and direct replies.",
                },
                {
                    "task": "Summarize a short note or email",
                    "fit": "Good fit",
                    "why": "Works well when the context is small and the output is short.",
                },
                {
                    "task": "Extract names, dates, or actions from text",
                    "fit": "Good fit",
                    "why": "Light parsing tasks do not need a lot of model horsepower.",
                },
                {
                    "task": "Run a multi-step assistant over many documents",
                    "fit": "Not ideal",
                    "why": "This profile is better for short responses than heavier agent loops.",
                },
            ],
            summary="This is a practical everyday choice for quick local assistance, but it will feel limited on larger or more agentic workloads.",
        )
    if tier == "strong":
        return RecommendationDetails(
            best_for="Coding assistants, RAG over larger documents, and higher-throughput agent workflows.",
            not_ideal_for=[
                "Tiny one-off prompts where you just want the fastest possible reply.",
                "Ultra-light local chat where extra hardware would be unnecessary.",
            ],
            examples=[
                {
                    "task": "Coding copilot for refactors and debugging",
                    "fit": "Excellent fit",
                    "why": "The config is suited for faster generation and more responsive iteration.",
                },
                {
                    "task": "Question answering over long documents",
                    "fit": "Excellent fit",
                    "why": "Better for larger prompts and more demanding context-heavy work.",
                },
                {
                    "task": "Multi-step agent workflow with tool calls",
                    "fit": "Excellent fit",
                    "why": "More headroom helps when the model has to think, call tools, and respond repeatedly.",
                },
                {
                    "task": "Serve multiple users at once",
                    "fit": "Good fit",
                    "why": "Stronger configs are better when you care about throughput and steadier latency.",
                },
            ],
            summary="This is the stronger choice when you want the model to handle longer prompts, more tools, and heavier assistant-style work.",
        )
    return RecommendationDetails(
        best_for="Interactive assistants, summarization, drafting, moderate coding help, and basic tool use.",
        not_ideal_for=[
            "Very large batch serving or long-running multi-agent chains.",
            "Heavy document reasoning with very large context windows.",
        ],
        examples=[
            {
                "task": "Summarize a meeting transcript",
                "fit": "Good fit",
                "why": "Balanced throughput makes short-to-medium summaries feel responsive.",
            },
            {
                "task": "Draft an email or a short report",
                "fit": "Good fit",
                "why": "A good everyday middle ground for writing help.",
            },
            {
                "task": "Help explain a code snippet or small bug",
                "fit": "Good fit",
                "why": "Enough headroom for useful coding assistance without overcommitting hardware.",
            },
            {
                "task": "Basic tool-using assistant",
                "fit": "Good fit",
                "why": "Can handle simple agent loops without needing the biggest configuration.",
            },
        ],
        summary="This is the middle-ground option for a useful assistant that still keeps resource use under control.",
    )


def _build_details(candidate: RecommendationCandidate) -> RecommendationDetails:
    return _narrative_for_tier(_tier_from_candidate(candidate), candidate)


def choose_recommendation(results: list[BenchmarkResult]) -> tuple[dict, dict, str, dict[str, Any]]:
    candidates = [r for r in results if r.status == "completed" and r.gen_tps is not None]
    if not candidates:
        raise ValueError("No successful benchmark results are available.")

    grouped: dict[str, list[BenchmarkResult]] = {}
    for row in candidates:
        key = json.dumps(row.config or {}, sort_keys=True)
        grouped.setdefault(key, []).append(row)

    averaged: list[RecommendationCandidate] = []
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

    def stability_score(row: RecommendationCandidate) -> tuple[int, float, float, int, float]:
        metrics = row.metrics
        config = row.config
        gpu_priority = 0 if int(config.get("num_gpu") or 0) > 0 else 1
        vram = float(metrics.get("max_vram_used_mb") or 0)
        latency = float(metrics.get("total_sec") or 0)
        num_gpu = int(config.get("num_gpu") or 0)
        return (gpu_priority, vram, latency, -num_gpu, -gen_tps(row))

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
        "the VRAM safety limit and preferring GPU-backed configs when throughput was close."
    )
    details = _build_details(selected)
    return selected.config, selected.metrics, reason, {
        "best_for": details.best_for,
        "not_ideal_for": details.not_ideal_for,
        "examples": details.examples,
        "summary": details.summary,
    }
