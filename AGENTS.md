# AGENTS.md

## Project: Ollama Benchmark Center

This repository contains a distributed benchmarking and visualization platform for Ollama-hosted models. It supports remote benchmark agents, automatic hardware detection, Ollama model discovery, benchmark matrix execution, result visualization, recommendation generation, and export of Ollama, Docker, Kubernetes, and Helm deployment configurations.

This file defines how autonomous coding agents should work in this repository.

It is intended for use with tools such as Claude Code, Codex, Cursor, Cline, Windsurf, OpenHands, Aider, and other coding agents.

---

## 1. Prime Directive

Agents must build a production-quality, containerized, multi-service application.

The application must be runnable locally with Docker Compose and deployable to Kubernetes with Helm.

The core services are:

```text
frontend        React/TypeScript UI
backend         Central FastAPI API and database integration
agent           Remote benchmark agent that talks to Ollama
ollama          Ollama server for local development
database        PostgreSQL for local and production-like development
prometheus      Optional metrics collection
grafana         Optional operations dashboard
```

Agents must not implement features as one-off scripts unless explicitly requested. Every feature should fit into the project architecture and be testable, containerized, documented, and observable.

---

## 2. Repository Layout

The repository must use this structure:

```text
/
├── AGENTS.md
├── README.md
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.gpu.yml
├── .env.example
├── .gitignore
├── Makefile
├── frontend/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── src/
│   └── tests/
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   └── tests/
├── agent/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── pyproject.toml
│   ├── app/
│   └── tests/
├── helm/
│   └── charts/
│       └── ollama-benchmark-center/
├── k8s/
│   └── generated/
├── monitoring/
│   ├── prometheus/
│   └── grafana/
├── docs/
│   ├── architecture.md
│   ├── local-development.md
│   ├── deployment.md
│   ├── benchmarking.md
│   ├── security.md
│   └── runbooks/
└── scripts/
    ├── dev-up.sh
    ├── dev-down.sh
    ├── build-images.sh
    ├── test-all.sh
    └── generate-k8s-from-helm.sh
```

Agents must preserve this layout unless there is a strong reason to change it. If changed, update this file and the README.

---

## 3. Service Responsibilities

### 3.1 Frontend

Path:

```text
/frontend
```

Stack:

```text
React
TypeScript
Vite
TailwindCSS
React Query
Zustand
Recharts or Plotly
```

Responsibilities:

- Hosts dashboard
- Host detail pages
- Benchmark wizard
- Live benchmark progress
- Result visualization
- Model comparison
- Export UI
- Settings UI
- Error display
- Friendly onboarding

Frontend owns product-specific visualization.

Grafana is not the primary benchmark visualization layer.

The frontend must visualize:

- Generation tokens/sec
- Prompt tokens/sec
- Latency
- VRAM usage
- RAM usage
- CPU usage
- Best config card
- Benchmark history
- Model comparison
- Host comparison

Grafana is only for operational observability.

Rules:

- Use TypeScript strict mode.
- Avoid `any` unless documented.
- Use API client types generated from OpenAPI when practical.
- Use React Query for server state.
- Use Zustand only for client UI state.
- Keep business logic out of React components.
- Use reusable components for cards, tables, charts, badges, forms, and empty states.
- All pages must handle loading, error, empty, and success states.
- UI must work in dark mode.
- Charts must be readable and not over-cluttered.

---

### 3.2 Backend

Path:

```text
/backend
```

Stack:

```text
Python 3.12+
FastAPI
SQLModel or SQLAlchemy
Alembic
PostgreSQL
Pydantic
httpx
```

Responsibilities:

- Host registration
- Agent communication
- Benchmark orchestration
- Result persistence
- Recommendation engine
- Export generation
- Authentication and authorization hooks
- API key handling
- OpenAPI schema
- Metrics
- Audit logging

Rules:

- Use async endpoints where IO is involved.
- Use a service layer.
- Use a repository layer for database access.
- Do not put database calls directly in route handlers.
- Pydantic schemas must be explicit.
- All public API responses must have typed response models.
- Use structured logging.
- Use request IDs.
- Database migrations must be generated and committed.
- Never store plaintext API keys if encryption support is implemented.
- Never return stored agent API keys to the frontend.

---

### 3.3 Benchmark Agent

Path:

```text
/agent
```

Stack:

```text
Python 3.12+
FastAPI
httpx
psutil
subprocess for controlled commands only
```

Responsibilities:

- Hardware detection
- Ollama API calls
- Benchmark execution
- Benchmark cancellation
- Resource sampling
- Local result buffering
- Agent health
- Metrics endpoint

Allowed controlled system commands:

```text
nvidia-smi
ollama
hostname
uname
cat /etc/os-release
```

Rules:

- Do not execute arbitrary shell commands from user input.
- Do not expose a generic shell API.
- Do not allow the frontend/backend to pass arbitrary command strings.
- All subprocess calls must use argument arrays, not shell strings.
- All subprocess calls must have timeouts.
- Gracefully handle missing `nvidia-smi`.
- Gracefully handle CPU-only hosts.
- Gracefully handle Ollama unavailable.
- Support API key authentication through `BENCH_AGENT_API_KEY`.
- Agent should be stateless where possible, except active in-memory benchmark runs.
- Long-term benchmark persistence belongs to the backend.

Agent must expose:

```text
GET  /health
GET  /hardware
GET  /ollama/models
POST /benchmark
GET  /benchmark/{benchmark_id}
POST /benchmark/{benchmark_id}/cancel
GET  /metrics
```

---

### 3.4 Platform / Kubernetes / Helm

Paths:

```text
/helm
/k8s
```

Responsibilities:

- Helm chart
- Kubernetes manifests
- GPU scheduling support
- Ingress
- Services
- ConfigMaps
- Secrets
- PVCs
- HPA
- NetworkPolicy
- ServiceAccount
- RBAC
- Prometheus ServiceMonitor

Rules:

- Helm is the source of truth.
- Raw Kubernetes manifests should be generated from Helm templates when needed.
- Avoid maintaining duplicate hand-written Kubernetes manifests that drift from Helm.
- Helm chart must pass `helm lint`.
- Helm chart must render with `helm template`.
- Default values must run in a simple local Kubernetes cluster.
- Production values must support external PostgreSQL and ingress/TLS.
- GPU support must be configurable.

---

### 3.5 Observability

Path:

```text
/monitoring
```

Responsibilities:

- Prometheus scrape config
- Grafana dashboards
- Metrics naming
- Operational dashboards
- Runbooks for failures

Application UI visualizes benchmark business results.

Grafana visualizes operational health:

- API latency
- Agent availability
- Benchmark queue depth
- Error rates
- CPU/RAM/GPU trends
- Kubernetes pod status
- Prometheus target health

Required metrics:

```text
benchmark_runs_total
benchmark_failures_total
benchmark_duration_seconds
benchmark_generation_tps
benchmark_prompt_tps
benchmark_latency_seconds
agent_hardware_refresh_total
agent_ollama_request_duration_seconds
agent_cpu_usage_percent
agent_ram_used_bytes
agent_gpu_vram_used_bytes
backend_http_request_duration_seconds
backend_agent_request_duration_seconds
```

---

### 3.6 Security

Responsibilities:

- API key auth
- Secrets management
- RBAC
- TLS
- NetworkPolicy
- Secure defaults
- Dependency scanning

Rules:

- Never hardcode secrets.
- Never commit `.env`.
- Provide `.env.example`.
- Do not run containers as root unless unavoidable and documented.
- Do not request privileged containers by default.
- Do not grant cluster-admin.
- Do not expose agent publicly without API key auth.
- Use Kubernetes Secrets for sensitive values.
- Use NetworkPolicy to restrict agent access when enabled.
- Use HTTPS/TLS at ingress in production values.

---

### 3.7 QA

Responsibilities:

- Unit tests
- Integration tests
- End-to-end tests
- Contract tests
- Docker build tests
- Helm tests

Coverage goals:

```text
backend: 90%+
agent:   90%+
frontend: 80%+
```

Minimum test areas:

- Hardware detection fallback behavior
- Ollama API parsing
- Benchmark metric calculations
- Benchmark cancellation
- Recommendation ranking
- Export generation
- Backend host registration
- Backend benchmark orchestration
- Frontend benchmark wizard
- Frontend results charts
- Helm template rendering

---

## 4. Local Container Development

The project must be buildable and runnable locally using Docker Compose.

### 4.1 Required Compose Files

Create and maintain these files:

```text
docker-compose.yml
docker-compose.dev.yml
docker-compose.gpu.yml
```

Purpose:

- `docker-compose.yml`: default local stack
- `docker-compose.dev.yml`: hot reload development overrides
- `docker-compose.gpu.yml`: NVIDIA GPU-enabled Ollama and agent overrides

### 4.2 Required Services in docker-compose.yml

The default Compose stack must include:

```text
frontend
backend
agent
ollama
postgres
prometheus
grafana
```

Prometheus and Grafana may be optional via profiles.

Use Compose profiles:

```text
core
observability
gpu
```

Example intent:

```bash
docker compose up --build
docker compose --profile observability up --build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

### 4.3 Local Development Ports

Use these defaults:

```text
frontend:   http://localhost:3000
backend:    http://localhost:8000
agent:      http://localhost:9000
ollama:     http://localhost:11434
postgres:   localhost:5432
prometheus: http://localhost:9090
grafana:    http://localhost:3001
```

If Grafana conflicts with frontend port 3000, Grafana must use 3001.

### 4.4 Required Environment Variables

Provide `.env.example` with:

```text
APP_ENV=development

FRONTEND_PORT=3000
BACKEND_PORT=8000
AGENT_PORT=9000

BACKEND_DATABASE_URL=postgresql+asyncpg://ollama_bench:ollama_bench@postgres:5432/ollama_bench

POSTGRES_DB=ollama_bench
POSTGRES_USER=ollama_bench
POSTGRES_PASSWORD=ollama_bench

OLLAMA_BASE_URL=http://ollama:11434

BENCH_AGENT_API_KEY=dev-agent-key
BACKEND_API_KEY=dev-backend-key

CORS_ORIGINS=http://localhost:3000

GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
```

### 4.5 Required Dockerfiles

Each app service must include a production and development Dockerfile:

```text
/frontend/Dockerfile
/frontend/Dockerfile.dev

/backend/Dockerfile
/backend/Dockerfile.dev

/agent/Dockerfile
/agent/Dockerfile.dev
```

Production Dockerfiles must:

- Use multi-stage builds where appropriate.
- Avoid unnecessary build tools in final images.
- Use non-root users where practical.
- Expose correct ports.
- Include health checks when practical.
- Pin base image major versions.
- Avoid copying secrets.

Development Dockerfiles must:

- Support hot reload.
- Mount local source via Compose volumes.
- Install dev dependencies.

### 4.6 Docker Compose Local Run Instructions

README and docs must include:

```bash
cp .env.example .env
docker compose up --build
```

Then verify:

```bash
curl http://localhost:8000/health
curl http://localhost:9000/health
curl http://localhost:11434/api/version
```

Open:

```text
http://localhost:3000
```

### 4.7 Docker Compose GPU Run Instructions

For NVIDIA GPU local development:

Prerequisites:

- NVIDIA GPU driver installed
- NVIDIA Container Toolkit installed
- Docker configured with NVIDIA runtime

Run:

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

GPU Compose override must configure the `ollama` and `agent` services with GPU access.

Example Compose intent:

```yaml
services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  agent:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

If using a Compose implementation that does not honor `deploy.resources`, document the alternative:

```yaml
gpus: all
```

### 4.8 Model Pulling for Local Dev

README must include examples:

```bash
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama list
```

For coding model testing:

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

For larger models, warn users about hardware requirements.

### 4.9 Makefile

Provide a Makefile with:

```text
make dev
make dev-gpu
make down
make logs
make build
make test
make test-backend
make test-agent
make test-frontend
make lint
make format
make migrate
make helm-lint
make helm-template
make k8s-render
```

Commands should wrap Docker Compose and local test commands.

---

## 5. Container Image Build Requirements

### 5.1 Image Names

Use consistent image names:

```text
ollama-benchmark-center/frontend
ollama-benchmark-center/backend
ollama-benchmark-center/agent
```

### 5.2 Build Script

Create:

```text
/scripts/build-images.sh
```

It must support:

```bash
./scripts/build-images.sh
./scripts/build-images.sh --tag v0.1.0
./scripts/build-images.sh --registry ghcr.io/my-org
```

### 5.3 CI Build Matrix

CI must build:

- frontend image
- backend image
- agent image

CI must fail if any image fails to build.

---

## 6. API Contracts

### 6.1 Backend Public API

Backend must expose:

```text
GET    /health
GET    /metrics

GET    /api/hosts
POST   /api/hosts
GET    /api/hosts/{host_id}
PATCH  /api/hosts/{host_id}
DELETE /api/hosts/{host_id}

POST   /api/hosts/{host_id}/refresh
GET    /api/hosts/{host_id}/hardware
GET    /api/hosts/{host_id}/models

POST   /api/benchmark-runs
GET    /api/benchmark-runs
GET    /api/benchmark-runs/{run_id}
POST   /api/benchmark-runs/{run_id}/cancel
GET    /api/benchmark-runs/{run_id}/recommendation

GET    /api/benchmark-runs/{run_id}/export/ollama
GET    /api/benchmark-runs/{run_id}/export/modelfile
GET    /api/benchmark-runs/{run_id}/export/llamacpp
GET    /api/benchmark-runs/{run_id}/export/docker-compose
GET    /api/benchmark-runs/{run_id}/export/kubernetes
GET    /api/benchmark-runs/{run_id}/export/helm-values
```

### 6.2 Agent API

Agent must expose:

```text
GET    /health
GET    /metrics
GET    /hardware
GET    /ollama/models
GET    /ollama/version
GET    /ollama/running

POST   /benchmark
GET    /benchmark/{benchmark_id}
POST   /benchmark/{benchmark_id}/cancel
```

### 6.3 OpenAPI

Backend and agent must expose OpenAPI specs.

CI should validate that OpenAPI generation does not fail.

---

## 7. Benchmarking Rules

### 7.1 Ollama Benchmark Call

Agent benchmarks via Ollama:

```text
POST /api/generate
```

Use:

```json
{
  "model": "model-name",
  "prompt": "benchmark prompt",
  "stream": false,
  "options": {
    "num_gpu": 48,
    "num_thread": 14,
    "num_ctx": 4096,
    "num_batch": 512,
    "num_predict": 256,
    "temperature": 0.2
  }
}
```

### 7.2 Metrics to Capture

From Ollama response:

```text
total_duration
load_duration
prompt_eval_count
prompt_eval_duration
eval_count
eval_duration
```

Compute:

```text
total_sec
load_sec
prompt_tps
gen_tps
output_tokens
```

### 7.3 Resource Sampling

During each benchmark test, agent samples:

```text
CPU %
RAM used
GPU VRAM used
GPU utilization if available
```

Sampling interval default:

```text
1 second
```

### 7.4 Benchmark Modes

Quick:

```text
repeats: 1
num_predict: 128
small matrix
```

Balanced:

```text
repeats: 2
num_predict: 256
medium matrix
```

Exhaustive:

```text
repeats: 3
num_predict: 512
large matrix
```

Custom:

```text
user-defined
```

### 7.5 First Run Handling

First run may include model load time.

Rules:

- Store first run.
- Mark first run as warmup when configured.
- Recommendation should prefer warmed results when enough repeats exist.

---

## 8. Recommendation Rules

Recommendation engine must choose best config using:

1. Ignore failed tests.
2. Compute average `gen_tps`.
3. Reject configs exceeding 95% VRAM usage if GPU total is known.
4. Select highest average `gen_tps`.
5. If configs are within 5% `gen_tps`, prefer lower VRAM usage.
6. If still tied, prefer lower total latency.
7. If still tied, prefer lower `num_gpu` for stability.
8. Generate explanation.

Output example:

```json
{
  "config": {
    "num_gpu": 48,
    "num_thread": 14,
    "num_ctx": 4096,
    "num_batch": 512
  },
  "metrics": {
    "gen_tps": 8.7,
    "prompt_tps": 220.4,
    "max_vram_used_mb": 11300
  },
  "reason": "Selected because it had the highest stable generation throughput while staying under the VRAM safety limit."
}
```

---

## 9. Database and Migrations

Use PostgreSQL for Docker Compose local development.

SQLite may be supported for simple single-binary experiments, but Compose should use PostgreSQL.

Required tables:

```text
hosts
hardware_snapshots
benchmark_runs
benchmark_results
recommendations
exports
audit_logs
```

Migrations:

- Use Alembic.
- All schema changes require migration files.
- CI must run migrations on a temporary database.
- Avoid destructive migrations without documentation.

---

## 10. Frontend UX Requirements

### 10.1 Hosts Dashboard

Show:

- host name
- health
- GPU
- VRAM
- CPU
- RAM
- Ollama version
- installed model count
- active benchmark count

Actions:

- add host
- refresh host
- open host details

### 10.2 Host Details

Show:

- hardware snapshot
- installed models
- recent benchmark runs
- agent status
- Ollama status

### 10.3 Benchmark Wizard

Steps:

1. Choose host
2. Choose model
3. Choose benchmark mode
4. Choose prompt type
5. Review generated matrix
6. Start benchmark

### 10.4 Live Benchmark

Show:

- progress bar
- current config
- current result
- partial results table
- resource usage
- cancel button

### 10.5 Results

Show:

- best config card
- recommendation reason
- charts
- sortable results table
- export buttons

Charts:

- gen TPS by num_gpu
- gen TPS by num_thread
- latency by config
- VRAM by config
- prompt TPS by config

### 10.6 Comparison

Allow comparing:

- multiple runs
- multiple hosts
- multiple models

---

## 11. Export Requirements

Generate the following from benchmark recommendations.

### 11.1 Ollama Options JSON

```json
{
  "num_gpu": 48,
  "num_thread": 14,
  "num_ctx": 4096,
  "num_batch": 512,
  "temperature": 0.2
}
```

### 11.2 Modelfile

```text
FROM model_name

PARAMETER num_ctx 4096
PARAMETER num_gpu 48
PARAMETER num_thread 14
PARAMETER num_batch 512
PARAMETER temperature 0.2
```

### 11.3 llama.cpp Command

```bash
llama-server \
  -m /models/model.gguf \
  --host 0.0.0.0 \
  --port 8080 \
  -ngl 48 \
  -t 14 \
  -c 4096 \
  -b 512
```

### 11.4 Docker Compose Snippet

Export a Compose service snippet for Ollama.

### 11.5 Kubernetes YAML

Export Deployment and Service.

### 11.6 Helm Values

Export a values override file for the Helm chart.

---

## 12. Helm Chart Requirements

Chart path:

```text
/helm/charts/ollama-benchmark-center
```

Required files:

```text
Chart.yaml
values.yaml
values-dev.yaml
values-prod.yaml
templates/_helpers.tpl
templates/frontend-deployment.yaml
templates/frontend-service.yaml
templates/backend-deployment.yaml
templates/backend-service.yaml
templates/agent-deployment.yaml
templates/agent-service.yaml
templates/configmap.yaml
templates/secret.yaml
templates/ingress.yaml
templates/pvc.yaml
templates/hpa.yaml
templates/networkpolicy.yaml
templates/serviceaccount.yaml
templates/servicemonitor.yaml
templates/NOTES.txt
```

Chart must support:

```bash
helm install ollama-benchmark-center ./helm/charts/ollama-benchmark-center
helm upgrade ollama-benchmark-center ./helm/charts/ollama-benchmark-center
helm rollback ollama-benchmark-center
helm uninstall ollama-benchmark-center
```

Chart must pass:

```bash
helm lint ./helm/charts/ollama-benchmark-center
helm template ollama-benchmark-center ./helm/charts/ollama-benchmark-center
```

### 12.1 GPU Values

Support:

```yaml
agent:
  gpu:
    enabled: true
    count: 1
  runtimeClassName: nvidia
  resources:
    limits:
      nvidia.com/gpu: 1
```

### 12.2 Database Values

Support local PostgreSQL dependency or external PostgreSQL:

```yaml
backend:
  database:
    type: postgres
    urlFromSecret: benchmark-db-secret
```

### 12.3 Ingress Values

Support:

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: benchmark.example.com
      paths:
        - path: /
          service: frontend
        - path: /api
          service: backend
  tls:
    - secretName: benchmark-tls
      hosts:
        - benchmark.example.com
```

---

## 13. Kubernetes Standards

- Use `readinessProbe`.
- Use `livenessProbe`.
- Use resource requests and limits.
- Use ConfigMaps for non-sensitive config.
- Use Secrets for sensitive config.
- Avoid privileged containers.
- Use NetworkPolicies where enabled.
- Use ServiceAccounts.
- Make GPU scheduling optional.
- Use labels and selectors consistently.
- Include common Helm labels.

---

## 14. CI/CD Requirements

Use GitHub Actions unless another CI system is specified.

Required jobs:

```text
frontend-lint
frontend-test
frontend-build
backend-lint
backend-test
agent-lint
agent-test
docker-build
helm-lint
helm-template
security-scan
```

CI must fail on:

- TypeScript errors
- Python lint errors
- Test failures
- Docker build failure
- Helm lint failure
- Helm template failure

Recommended tools:

```text
ruff
mypy or pyright
pytest
vitest
playwright
eslint
prettier
trivy
helm
```

---

## 15. Documentation Requirements

Required docs:

```text
README.md
docs/architecture.md
docs/local-development.md
docs/docker-compose.md
docs/gpu-development.md
docs/kubernetes.md
docs/helm.md
docs/benchmarking.md
docs/recommendations.md
docs/security.md
docs/observability.md
docs/runbooks/agent-offline.md
docs/runbooks/ollama-unavailable.md
docs/runbooks/gpu-not-detected.md
docs/runbooks/benchmark-failing.md
```

README must include:

- Project overview
- Architecture diagram
- Quick start with Docker Compose
- GPU local development
- First benchmark
- Helm install
- Common troubleshooting

---

## 16. Work Breakdown Strategy

Agents should build in this order.

### Phase 1: Foundation

- Repository layout
- Docker Compose
- Base Dockerfiles
- Health endpoints
- Basic README
- Makefile

### Phase 2: Agent

- Hardware detection
- Ollama version check
- Ollama model listing
- Agent auth
- Agent tests

### Phase 3: Backend

- Host registration
- Agent client
- Database models
- Migrations
- Hardware snapshot persistence

### Phase 4: Benchmarking

- Agent benchmark runner
- Resource sampler
- Backend benchmark orchestration
- Result persistence

### Phase 5: Recommendations

- Recommendation engine
- Unit tests
- Explanation generation

### Phase 6: Frontend

- Hosts dashboard
- Host details
- Benchmark wizard
- Live run view
- Results view

### Phase 7: Exports

- Ollama JSON
- Modelfile
- llama.cpp
- Docker Compose
- Kubernetes
- Helm values

### Phase 8: Helm and Kubernetes

- Helm chart
- Values files
- GPU support
- Ingress
- NetworkPolicies
- HPA
- ServiceMonitor

### Phase 9: Observability

- Metrics
- Prometheus config
- Grafana dashboards
- Runbooks

### Phase 10: Hardening

- Security review
- E2E tests
- CI/CD
- Documentation
- Release process

---

## 17. Pull Request Rules

Every PR must include:

- Summary
- Files changed
- Tests run
- Screenshots for UI changes
- Migration notes if DB changed
- Helm impact if deployment changed
- Security impact if auth/secrets changed

Do not merge if:

- Tests fail
- Docker builds fail
- Helm lint fails
- Helm template fails
- TypeScript build fails
- API contracts changed without docs
- Secrets are committed

---

## 18. Definition of Done

A feature is complete only when:

```text
[ ] Code implemented
[ ] Unit tests added
[ ] Integration tests added where applicable
[ ] Frontend states handled where applicable
[ ] API docs updated
[ ] Database migrations added where applicable
[ ] Docker image builds
[ ] Docker Compose still runs
[ ] Helm lint passes
[ ] Helm template passes
[ ] README/docs updated
[ ] Metrics added where useful
[ ] Errors are handled clearly
[ ] Security considerations reviewed
```

---

## 19. Commands Agents Should Use

Local development:

```bash
cp .env.example .env
docker compose up --build
```

GPU development:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Stop:

```bash
docker compose down
```

Rebuild:

```bash
docker compose build
```

Test everything:

```bash
make test
```

Helm lint:

```bash
helm lint ./helm/charts/ollama-benchmark-center
```

Helm template:

```bash
helm template ollama-benchmark-center ./helm/charts/ollama-benchmark-center
```

---

## 20. Non-Negotiables

- The app must run locally with Docker Compose.
- The app must be deployable with Helm.
- The agent must support running on different hardware than the UI.
- The UI must visualize benchmark results directly.
- Grafana must be used only for operational observability.
- The agent must not execute arbitrary commands.
- Secrets must not be committed.
- Helm is the source of truth for Kubernetes deployment.
- Docker images must build reproducibly.
- Tests and docs are required for complete work.

---

End of AGENTS.md
