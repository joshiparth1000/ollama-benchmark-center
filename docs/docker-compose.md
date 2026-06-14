# Docker Compose

Default:

```bash
docker compose up --build
```

Observability:

```bash
docker compose --profile observability up --build
```

GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```
