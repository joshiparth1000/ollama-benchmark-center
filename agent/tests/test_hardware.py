from app.services.hardware import hardware_snapshot


def test_hardware_snapshot_has_cpu_and_ram():
    snapshot = hardware_snapshot()

    assert "cpu" in snapshot
    assert "ram" in snapshot
    assert isinstance(snapshot["gpus"], list)
