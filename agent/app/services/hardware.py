import os
import platform
import shutil
import subprocess
from typing import Any

import psutil


NVIDIA_LIBRARY_PATH = "/opt/nvidia/lib/minimal"


def _run_allowed(args: list[str], timeout: int = 5, env: dict[str, str] | None = None) -> str | None:
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env={**os.environ, **(env or {})},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout.strip()


def detect_gpus() -> list[dict[str, Any]]:
    if not shutil.which("nvidia-smi"):
        return []
    output = _run_allowed(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.total,memory.used,utilization.gpu",
            "--format=csv,noheader,nounits",
        ],
        env={"LD_LIBRARY_PATH": NVIDIA_LIBRARY_PATH},
    )
    if not output:
        return []
    gpus = []
    for index, line in enumerate(output.splitlines()):
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 4:
            continue
        name, total, used, utilization = parts
        try:
            total_mb = float(total)
            used_mb = float(used)
            utilization_percent = float(utilization)
        except ValueError:
            continue
        gpus.append(
            {
                "index": index,
                "name": name,
                "vram_total_mb": total_mb,
                "vram_used_mb": used_mb,
                "utilization_percent": utilization_percent,
            }
        )
    return gpus


def hardware_snapshot() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    return {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "cpu": {
            "logical_count": psutil.cpu_count(logical=True),
            "physical_count": psutil.cpu_count(logical=False),
            "usage_percent": psutil.cpu_percent(interval=0.1),
        },
        "ram": {
            "total_bytes": memory.total,
            "used_bytes": memory.used,
            "usage_percent": memory.percent,
        },
        "gpus": detect_gpus(),
        "os_release": _run_allowed(["cat", "/etc/os-release"]) or "",
    }


def resource_sample() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    gpus = detect_gpus()
    return {
        "cpu_usage_percent": psutil.cpu_percent(interval=None),
        "ram_used_bytes": memory.used,
        "ram_total_bytes": memory.total,
        "ram_usage_percent": memory.percent,
        "gpus": gpus,
        "max_vram_used_mb": max((gpu["vram_used_mb"] for gpu in gpus), default=0),
        "gpu_vram_total_mb": max((gpu["vram_total_mb"] for gpu in gpus), default=0),
    }
