from app.services.recommendations import choose_recommendation
from app.services.benchmark_matrix import (
    build_matrix,
    context_windows,
    hardware_context_cap,
    max_context_window,
    safe_thread_counts,
)


class Result:
    def __init__(self, config, metrics, status="completed"):
        self.config = config
        self.metrics = metrics
        self.status = status
        self.gen_tps = metrics.get("gen_tps")


def test_choose_recommendation_prefers_fast_stable_config():
    config, metrics, reason, details = choose_recommendation(
        [
            Result({"num_gpu": 48}, {"gen_tps": 10, "max_vram_used_mb": 9800, "gpu_vram_total_mb": 10000}),
            Result({"num_gpu": 32}, {"gen_tps": 9.8, "max_vram_used_mb": 7000, "gpu_vram_total_mb": 10000}),
        ]
    )

    assert config["num_gpu"] == 32
    assert metrics["gen_tps"] == 9.8
    assert "Selected" in reason
    assert "summary" in details


def test_build_matrix_uses_full_gpu_offload_when_gpu_is_available():
    matrix = build_matrix("quick", gpu_available=True, hardware={"cpu": {"logical_count": 16}})

    assert any(config["num_gpu"] == -1 for config in matrix)
    assert all(config["num_gpu"] != 0 for config in matrix)


def test_build_matrix_reserves_one_thread_for_the_os():
    hardware = {"cpu": {"logical_count": 16}}

    assert safe_thread_counts(hardware) == [4, 8, 12, 15]
    matrix = build_matrix("exhaustive", gpu_available=True, hardware=hardware)

    assert max(config["num_thread"] for config in matrix) == 15
    assert all(config["num_thread"] < 16 for config in matrix)


def test_build_matrix_expands_context_for_7b_models():
    hardware = {"cpu": {"logical_count": 16}, "gpus": [{"vram_total_mb": 12288}]}

    assert hardware_context_cap("qwen2.5-coder:7b", True, hardware) == 65536
    assert context_windows("qwen2.5-coder:7b", "balanced", True, hardware) == [
        4096,
        8192,
        16384,
        32768,
    ]
    assert context_windows("qwen2.5-coder:7b", "exhaustive", True, hardware) == [
        4096,
        8192,
        16384,
        32768,
        65536,
    ]
    matrix = build_matrix("balanced", gpu_available=True, hardware=hardware, model="qwen2.5-coder:7b")

    assert {config["num_ctx"] for config in matrix} == {4096, 8192, 16384, 32768}
    assert {config["num_thread"] for config in matrix} == {4, 8, 12}


def test_context_caps_follow_model_size_and_hardware():
    low_vram = {"gpus": [{"vram_total_mb": 8192}]}
    mid_vram = {"gpus": [{"vram_total_mb": 12288}]}
    large_vram = {"gpus": [{"vram_total_mb": 49152}]}

    assert max(context_windows("qwen2.5-coder:7b", "exhaustive", True, low_vram)) == 32768
    assert max(context_windows("qwen2.5-coder:7b", "exhaustive", True, mid_vram)) == 65536
    assert max(context_windows("qwen3-coder:30b", "exhaustive", True, mid_vram)) == 8192
    assert max(context_windows("qwen3-coder:30b", "exhaustive", True, large_vram)) == 65536
    assert max(context_windows("qwen2.5-coder:7b", "exhaustive", False, large_vram)) == 8192
    assert max_context_window("qwen2.5-coder:7b", "exhaustive", True, mid_vram) == 65536


def test_choose_recommendation_prefers_gpu_backed_result_when_available():
    config, metrics, reason, _ = choose_recommendation(
        [
            Result({"num_gpu": 0, "num_thread": 8}, {"gen_tps": 18, "total_sec": 5, "max_vram_used_mb": 0}),
            Result(
                {"num_gpu": -1, "num_thread": 8},
                {"gen_tps": 14, "total_sec": 6, "max_vram_used_mb": 6000, "gpu_vram_total_mb": 12000},
            ),
        ]
    )

    assert config["num_gpu"] == -1
    assert metrics["gen_tps"] == 14
    assert "GPU-backed" in reason


def test_choose_recommendation_prefers_larger_context_when_throughput_is_close():
    config, _, _, details = choose_recommendation(
        [
            Result(
                {"num_gpu": -1, "num_thread": 4, "num_ctx": 4096},
                {"gen_tps": 20, "total_sec": 5, "max_vram_used_mb": 5000, "gpu_vram_total_mb": 12000},
            ),
            Result(
                {"num_gpu": -1, "num_thread": 12, "num_ctx": 16384},
                {"gen_tps": 19.2, "total_sec": 5.2, "max_vram_used_mb": 7000, "gpu_vram_total_mb": 12000},
            ),
        ]
    )

    assert config["num_ctx"] == 16384
    assert config["num_thread"] == 12
    assert details["recommended_context"] == 16384
    assert details["max_tested_context"] == 16384
    assert "16,384 tokens" in details["context_window_note"]


def test_choose_recommendation_rejects_cpu_fallback_when_gpu_was_visible():
    try:
        choose_recommendation(
            [
                Result(
                    {"num_gpu": 0, "num_thread": 8},
                    {"gen_tps": 18, "total_sec": 5, "max_vram_used_mb": 0, "gpu_vram_total_mb": 12000},
                ),
                Result(
                    {"num_gpu": -1, "num_thread": 8},
                    {"gpu_vram_total_mb": 12000},
                    status="failed",
                ),
            ]
        )
    except ValueError as exc:
        assert "GPU hardware was detected" in str(exc)
    else:
        raise AssertionError("Expected CPU fallback to be rejected when GPU was visible")


def test_choose_recommendation_averages_repeated_configs():
    config, metrics, _, details = choose_recommendation(
        [
            Result({"num_thread": 4}, {"gen_tps": 12, "total_sec": 8, "max_vram_used_mb": 1000}),
            Result({"num_thread": 4}, {"gen_tps": 4, "total_sec": 10, "max_vram_used_mb": 1000}),
            Result({"num_thread": 8}, {"gen_tps": 9, "total_sec": 9, "max_vram_used_mb": 1100}),
        ]
    )

    assert config["num_thread"] == 8
    assert metrics["gen_tps"] == 9
    assert details["examples"]


def test_choose_recommendation_prefers_lower_vram_within_five_percent():
    config, _, _, _ = choose_recommendation(
        [
            Result({"num_gpu": 48}, {"gen_tps": 10, "total_sec": 8, "max_vram_used_mb": 9000}),
            Result({"num_gpu": 32}, {"gen_tps": 9.6, "total_sec": 8, "max_vram_used_mb": 7000}),
        ]
    )

    assert config["num_gpu"] == 32


def test_choose_recommendation_describes_lightweight_tasks_for_cpu_only():
    _, _, _, details = choose_recommendation(
        [Result({"num_gpu": 0, "num_thread": 4}, {"gen_tps": 6, "total_sec": 12, "max_vram_used_mb": 0})]
    )

    assert "Simple chat" in details["best_for"]
    assert any("RAG" in item for item in details["not_ideal_for"])
    assert any(example["fit"] == "Good fit" for example in details["examples"])


def test_choose_recommendation_describes_balanced_and_strong_tasks():
    _, _, _, balanced = choose_recommendation(
        [Result({"num_gpu": 1, "num_predict": 128}, {"gen_tps": 12, "total_sec": 7, "max_vram_used_mb": 4200, "gpu_vram_total_mb": 12000})]
    )
    _, _, _, strong = choose_recommendation(
        [Result({"num_gpu": 1, "num_predict": 512, "num_batch": 1024}, {"gen_tps": 28, "total_sec": 5, "max_vram_used_mb": 7000, "gpu_vram_total_mb": 12000})]
    )

    assert "Interactive assistants" in balanced["best_for"]
    assert any("code" in example["task"].lower() for example in balanced["examples"])
    assert "Coding assistants" in strong["best_for"]
    assert any("multi-step" in example["task"].lower() for example in strong["examples"])
