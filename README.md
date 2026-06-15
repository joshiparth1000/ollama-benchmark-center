# Ollama Benchmark Center

Ollama Benchmark Center is a local-first platform for benchmarking Ollama-hosted models and turning the results into something a person can actually use. It includes a React dashboard, FastAPI backend, remote benchmark agent, PostgreSQL, Ollama, optional Prometheus/Grafana, and Helm charts for Kubernetes.

## What It Does

- Manages local or remote benchmark hosts from a sidebar tree
- Discovers host hardware and available Ollama models
- Runs benchmark matrices against selected models and prompts
- Samples CPU, RAM, and GPU signals during runs
- Shows running test counts, live progress, results, and comparison charts
- Generates plain-English recommendations with example use cases
- Exports configs for Ollama, Modelfile, llama.cpp, Docker Compose, Kubernetes, and Helm values

## Architecture

```text
frontend -> backend -> agent -> Ollama
                    -> PostgreSQL
backend/agent -> Prometheus -> Grafana
```

## Services And Ports

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Agent: `http://localhost:9000`
- Ollama: `http://localhost:11434`
- PostgreSQL: `localhost:5432`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`.

The default stack brings up:

- `frontend`
- `backend`
- `agent`
- `ollama`
- `postgres`

Prometheus and Grafana are available under the `observability` profile.

```bash
docker compose --profile observability up --build
```

For GPU-enabled local development, use the GPU override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

## First Benchmark Flow

1. Start the Compose stack.
2. Pull a model into Ollama if needed.
3. Add the local agent at `http://localhost:9000`.
4. Select the host in the left sidebar tree.
5. Use the host workspace to refresh models and start a benchmark.
6. Expand the host to see benchmark tests already conducted.
7. Click a test to review recommendations, charts, metrics, and exports.
8. Use the top-right running count to inspect active test progress.

## Useful Checks

```bash
curl http://localhost:8000/health
curl http://localhost:9000/health
curl http://localhost:11434/api/version
```

Pull models from the Ollama container:

```bash
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama list
```

For coding-style tests:

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

## Recommendation Output

The results view shows both technical and plain-English guidance. Each recommendation includes:

- Best config summary
- Why it was selected
- What it is good for
- What it is not ideal for
- Example tasks for non-technical users

The technical metrics remain visible, but they are secondary to the task-fit explanation.

## Helm

The repository includes Helm charts under `helm/charts/`, including the runtime chart used for Ollama and the application chart used for the benchmark platform.

```bash
helm lint ./helm/charts/ollama-runtime
helm template ollama-runtime ./helm/charts/ollama-runtime
helm lint ./helm/charts/ollama-benchmark-center
helm template ollama-benchmark-center ./helm/charts/ollama-benchmark-center
```

## Troubleshooting

- Agent offline: confirm `BENCH_AGENT_API_KEY` matches on the backend and agent.
- Ollama unavailable: check `curl http://localhost:11434/api/version`.
- No GPU detected: use the GPU override or the GPU-enabled Helm values and confirm the node has NVIDIA support.
- Hardware refresh failed: make sure the agent can reach Ollama and that the host URL is correct in the UI.
