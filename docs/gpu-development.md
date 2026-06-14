# GPU Development

The GPU override enables `gpus: all` and NVIDIA device reservations for Ollama and the benchmark agent.

Prerequisites:

- NVIDIA GPU driver
- NVIDIA Container Toolkit
- Docker configured with GPU runtime

If `deploy.resources` is ignored by the local Compose implementation, `gpus: all` is also present.
