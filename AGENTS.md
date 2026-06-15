# AGENTS.md

## Project: Ollama Benchmark Center

This repository contains a distributed benchmarking and visualization platform for Ollama-hosted models. The app is already split into a React frontend, FastAPI backend, remote FastAPI agent, PostgreSQL persistence, Ollama runtime, optional Prometheus/Grafana observability, and Helm charts for local and Kubernetes deployment.

This file tells autonomous coding agents how to work in this repository.

Use it as the source of truth for repository shape, service boundaries, and implementation constraints.

---

## 1. Prime Directive

Build and maintain a production-quality, containerized, multi-service application.

The app must remain runnable locally with Docker Compose and deployable to Kubernetes with Helm.

The core services are:

```text
frontend        React/TypeScript dashboard
backend         Central FastAPI API and persistence layer
agent           Remote benchmark agent that talks to Ollama
ollama          Ollama server for local development and GPU testing
postgres        PostgreSQL for durable state
prometheus      Optional metrics collection
grafana         Optional operations dashboard
```

Agents must not add one-off scripts where a service, endpoint, or test belongs in the normal architecture. Keep features testable, containerized, documented, and observable.

---

## 2. Repository Layout

The repository should stay close to this structure:

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
├── backend/
├── agent/
├── helm/
│   └── charts/
│       ├── ollama-benchmark-center/
│       └── ollama-runtime/
├── monitoring/
├── docs/
└── scripts/
```

The runtime chart under `helm/charts/ollama-runtime` is the current focus for Ollama plus agent deployment work. The app chart under `helm/charts/ollama-benchmark-center` remains the main application chart.

Preserve this layout unless there is a strong reason to change it. If you change it, update this file and the README together.

---

## 3. Product Behavior To Preserve

The application currently supports:

- Host CRUD, refresh, and hardware discovery
- Sidebar tree navigation with hosts as parent nodes and benchmark runs as child nodes
- Agent model discovery
- Benchmark wizard with model dropdown and prompt templates
- Custom prompt entry only when requested by the user
- Live benchmark runs with progress and cancellation
- Results pages with charts for latency, throughput, VRAM, RAM, and CPU
- Benchmark comparison views
- Export of Ollama, Modelfile, llama.cpp, Docker Compose, Kubernetes, and Helm values
- Plain-English recommendations with task examples, best-for guidance, and not-ideal-for guidance

Treat these as working product features, not future ideas.

---

## 4. Service Responsibilities

### 4.1 Frontend

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
Recharts
```

Responsibilities:

- Sidebar host tree and host management actions
- Host-scoped benchmark wizard
- Top-right running test indicator and progress popover
- Run results and recommendation screens
- Export buttons and download flows
- Friendly empty, loading, and error states

Frontend owns the product-facing visualization layer. Grafana is for operations, not benchmark interpretation.

Frontend must keep charts readable, restrained, and oriented around the task user:

- generation tokens/sec
- prompt tokens/sec
- latency
- VRAM usage
- RAM usage
- CPU usage
- host/model comparisons
- best config card

Rules:

- Use TypeScript strict mode.
- Use React Query for server state.
- Use Zustand only for local UI state.
- Keep business logic out of components where practical.
- Do not hide important state behind a blank screen.
- Keep dark mode working.
- Make chart axes and tables readable on real data.

### 4.2 Backend

Path:

```text
/backend
```

Stack:

```text
Python 3.12+
FastAPI
SQLAlchemy 2.x async or SQLModel
Alembic
PostgreSQL
Pydantic
httpx
```

Responsibilities:

- Host registration and CRUD
- Host refresh and discovery through registered agents
- Benchmark orchestration
- Result persistence
- Recommendation generation
- Export generation
- API key handling
- Request IDs and structured logging
- Metrics and audit logging

The backend must expose typed API responses and keep database access in repositories or services, not route handlers.

Current API surface includes:

- host CRUD and refresh
- hardware and model discovery
- benchmark run creation, polling, and cancellation
- recommendation retrieval
- export endpoints for Ollama JSON, Modelfile, llama.cpp, Docker Compose, Kubernetes, and Helm values

Recommendation payloads now include human-facing details such as:

- best_for
- not_ideal_for
- examples
- summary

These details are deterministic and rule-based. Do not replace them with free-form text unless explicitly requested.

### 4.3 Benchmark Agent

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
- Resource sampling during benchmark runs
- Local in-memory state for active benchmark runs
- Health and metrics endpoints

The agent should degrade gracefully on CPU-only hosts and when NVIDIA tooling is unavailable.

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
- Use argument arrays, never shell strings, for subprocess calls.
- Apply timeouts to every subprocess call.
- Keep long-term persistence in the backend.

### 4.4 Platform / Kubernetes / Helm

Paths:

```text
/helm
/monitoring
```

Responsibilities:

- Helm charting
- Kubernetes services and deployments
- GPU scheduling support
- Ingress and TLS
- ConfigMaps and Secrets
- PVCs and hostPath persistence where required
- HPA
- NetworkPolicy
- ServiceAccount and RBAC
- ServiceMonitor

Rules:

- Helm is the source of truth for Kubernetes deployment.
- Raw manifests should be generated from Helm templates, not hand-maintained in parallel.
- Charts must pass `helm lint` and `helm template`.
- GPU support should be configurable through values.

### 4.5 Observability

Path:

```text
/monitoring
```

Responsibilities:

- Prometheus scrape config
- Grafana dashboards
- Operational runbooks
- Metrics naming and dashboard consistency

Application UI visualizes benchmark results.

Grafana visualizes operational health such as:

- API latency
- agent availability
- benchmark run duration
- error rates
- CPU, RAM, and GPU trends
- Kubernetes pod status
- Prometheus target health

Required metrics include:

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

### 4.6 Security

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
- Do not expose the agent publicly without API key auth.
- Use Kubernetes Secrets for sensitive values.
- Use NetworkPolicy to restrict agent access when enabled.

### 4.7 QA

Responsibilities:

- Unit tests
- Integration tests
- End-to-end tests
- Contract tests
- Docker build checks
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
- Recommendation ranking and example generation
- Export generation
- Backend host registration and refresh
- Backend benchmark orchestration
- Frontend benchmark wizard
- Frontend results charts
- Frontend host hardware details
- Helm template rendering

---

## 5. Local Container Development

The project must stay runnable with Docker Compose.

### 5.1 Required Compose Files

Keep and update these files:

```text
docker-compose.yml
docker-compose.dev.yml
docker-compose.gpu.yml
```

Purpose:

- `docker-compose.yml`: default local stack
- `docker-compose.dev.yml`: hot reload overrides
- `docker-compose.gpu.yml`: GPU-enabled Ollama and agent overrides

### 5.2 Default Stack

The default Compose stack should include:

```text
frontend
backend
agent
ollama
postgres
prometheus
grafana
```

Prometheus and Grafana may be optional via profile.

Use the documented ports:

```text
frontend:   3000
backend:    8000
agent:      9000
ollama:     11434
postgres:   5432
prometheus: 9090
grafana:    3001
```

### 5.3 Environment Variables

Keep `.env.example` accurate. At minimum, it should cover:

- app environment
- frontend, backend, and agent ports
- backend database URL
- PostgreSQL credentials
- Ollama base URL
- backend and agent API keys
- CORS origins
- Grafana admin credentials when used locally

### 5.4 Compose Expectations

The local dev flow should work with:

```bash
docker compose up --build
docker compose --profile observability up --build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

---

## 6. Benchmarking And Recommendations

The benchmark service must keep the following modes:

- `quick`
- `balanced`
- `exhaustive`
- `custom`

The benchmark runner computes and persists:

- total_sec
- load_sec
- prompt_tps
- gen_tps
- output_tokens

Recommendation rules:

- Ignore failed runs when ranking
- Average `gen_tps`
- Reject configs above 95% VRAM when GPU total is known
- Choose highest `gen_tps`
- Within 5%, prefer lower VRAM
- Then lower latency
- Then lower `num_gpu`
- Generate a human-readable reason

The recommendation explanation should help non-experts understand what the config is good for in practice. Prefer deterministic examples over vague prose.

---

## 7. Workflow For Agents

When making changes:

1. Read the relevant service files first.
2. Prefer the repository’s existing patterns.
3. Keep edits scoped to the feature being changed.
4. Update tests with the behavior change.
5. Update docs when user-visible behavior changes.
6. Verify with the smallest meaningful command set.

When a change affects multiple layers, keep them in sync:

- API shape
- service logic
- database schema
- tests
- frontend UI
- README and AGENTS.md

---

## 8. Do Not Drift

If the code evolves past this file, update this file and the README together.

The goal is for a new contributor, or another coding agent, to be able to read the docs and immediately understand how the app currently works.
