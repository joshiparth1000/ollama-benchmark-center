# Ollama Benchmark Center

Distributed benchmarking and visualization for Ollama-hosted models.

The app contains a React dashboard, FastAPI backend, remote FastAPI benchmark agent, PostgreSQL, Ollama, optional Prometheus/Grafana, and a Helm chart for Kubernetes deployment.

## Architecture

```text
frontend -> backend -> agent -> Ollama
                    -> PostgreSQL
backend/agent -> Prometheus -> Grafana
```

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`.

Verify services:

```bash
curl http://localhost:8000/health
curl http://localhost:9000/health
curl http://localhost:11434/api/version
```

Pull a model:

```bash
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama list
```

For coding model tests:

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

## GPU Development

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Requires NVIDIA drivers, NVIDIA Container Toolkit, and Docker GPU runtime support.

## Helm

```bash
helm lint ./helm/charts/ollama-benchmark-center
helm template ollama-benchmark-center ./helm/charts/ollama-benchmark-center
helm install ollama-benchmark-center ./helm/charts/ollama-benchmark-center
```

## First Benchmark

1. Start the Compose stack.
2. Pull an Ollama model.
3. Add the local agent at `http://localhost:9000`.
4. Refresh the host.
5. Start a quick benchmark.
6. Review results, recommendation, and exports.

## Troubleshooting

- Agent offline: confirm `BENCH_AGENT_API_KEY` matches backend and agent.
- Ollama unavailable: check `curl http://localhost:11434/api/version`.
- GPU missing: confirm `nvidia-smi` works on the host and the GPU Compose override is active.
