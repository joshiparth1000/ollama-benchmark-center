from app.services.recommendations import choose_recommendation


class Result:
    def __init__(self, config, metrics, status="completed"):
        self.config = config
        self.metrics = metrics
        self.status = status
        self.gen_tps = metrics.get("gen_tps")


def test_choose_recommendation_prefers_fast_stable_config():
    config, metrics, reason = choose_recommendation(
        [
            Result({"num_gpu": 48}, {"gen_tps": 10, "max_vram_used_mb": 9800, "gpu_vram_total_mb": 10000}),
            Result({"num_gpu": 32}, {"gen_tps": 9.8, "max_vram_used_mb": 7000, "gpu_vram_total_mb": 10000}),
        ]
    )

    assert config["num_gpu"] == 32
    assert metrics["gen_tps"] == 9.8
    assert "Selected" in reason


def test_choose_recommendation_averages_repeated_configs():
    config, metrics, _ = choose_recommendation(
        [
            Result({"num_thread": 4}, {"gen_tps": 12, "total_sec": 8, "max_vram_used_mb": 1000}),
            Result({"num_thread": 4}, {"gen_tps": 4, "total_sec": 10, "max_vram_used_mb": 1000}),
            Result({"num_thread": 8}, {"gen_tps": 9, "total_sec": 9, "max_vram_used_mb": 1100}),
        ]
    )

    assert config["num_thread"] == 8
    assert metrics["gen_tps"] == 9


def test_choose_recommendation_prefers_lower_vram_within_five_percent():
    config, _, _ = choose_recommendation(
        [
            Result({"num_gpu": 48}, {"gen_tps": 10, "total_sec": 8, "max_vram_used_mb": 9000}),
            Result({"num_gpu": 32}, {"gen_tps": 9.6, "total_sec": 8, "max_vram_used_mb": 7000}),
        ]
    )

    assert config["num_gpu"] == 32
