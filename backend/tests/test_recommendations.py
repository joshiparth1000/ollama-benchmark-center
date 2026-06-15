from app.services.recommendations import choose_recommendation


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
