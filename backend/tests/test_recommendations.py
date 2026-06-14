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
