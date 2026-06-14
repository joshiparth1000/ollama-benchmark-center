from typing import Any


def build_matrix(mode: str, gpu_available: bool) -> list[dict[str, Any]]:
    base = {"num_thread": 4, "num_ctx": 4096, "num_batch": 512, "temperature": 0.2}
    cpu = base | {"num_gpu": 0}
    gpu = base | {"num_gpu": 1}

    if mode == "balanced":
        matrix = [cpu | {"num_predict": 256}, gpu | {"num_predict": 256}]
        if gpu_available:
            matrix.append(gpu | {"num_thread": 8, "num_predict": 256})
        return matrix

    if mode == "exhaustive":
        matrix = [
            cpu | {"num_predict": 512},
            cpu | {"num_thread": 8, "num_predict": 512},
            gpu | {"num_predict": 512},
        ]
        if gpu_available:
            matrix.extend(
                [
                    gpu | {"num_thread": 8, "num_predict": 512},
                    gpu | {"num_thread": 12, "num_batch": 1024, "num_predict": 512},
                ]
            )
        return matrix

    matrix = [cpu | {"num_predict": 128}, gpu | {"num_predict": 128}]
    if gpu_available:
        matrix.append(gpu | {"num_thread": 8, "num_predict": 128})
    return matrix
