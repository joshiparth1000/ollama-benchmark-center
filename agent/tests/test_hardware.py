from app.services import hardware
from app.services.hardware import hardware_snapshot


def test_hardware_snapshot_has_cpu_and_ram():
    snapshot = hardware_snapshot()

    assert "cpu" in snapshot
    assert "ram" in snapshot
    assert isinstance(snapshot["gpus"], list)


def test_detect_gpus_skips_malformed_nvidia_smi_rows(monkeypatch):
    monkeypatch.setattr(hardware.shutil, "which", lambda name: "/usr/bin/nvidia-smi")
    monkeypatch.setattr(
        hardware,
        "_run_allowed",
        lambda args, timeout=5, env=None: "NVIDIA A10, 23028, 12000, 82\nbad row\nNVIDIA T4, N/A, 100, N/A",
    )

    gpus = hardware.detect_gpus()

    assert gpus == [
        {
            "index": 0,
            "name": "NVIDIA A10",
            "vram_total_mb": 23028.0,
            "vram_used_mb": 12000.0,
            "utilization_percent": 82.0,
        }
    ]
