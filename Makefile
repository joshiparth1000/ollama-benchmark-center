COMPOSE=docker compose
HELM_CHART=./helm/charts/ollama-benchmark-center

.PHONY: dev dev-gpu down logs build test test-backend test-agent test-frontend lint format migrate helm-lint helm-template k8s-render

dev:
	$(COMPOSE) up --build

dev-gpu:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.gpu.yml up --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

build:
	$(COMPOSE) build

test: test-backend test-agent test-frontend helm-lint helm-template

test-backend:
	cd backend && pytest

test-agent:
	cd agent && pytest

test-frontend:
	cd frontend && npm test

lint:
	cd backend && ruff check app tests
	cd agent && ruff check app tests
	cd frontend && npm run lint

format:
	cd backend && ruff format app tests
	cd agent && ruff format app tests
	cd frontend && npm run format

migrate:
	cd backend && alembic upgrade head

helm-lint:
	helm lint $(HELM_CHART)

helm-template:
	helm template ollama-benchmark-center $(HELM_CHART)

k8s-render:
	./scripts/generate-k8s-from-helm.sh
