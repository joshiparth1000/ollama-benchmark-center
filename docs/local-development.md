# Local Development

```bash
cp .env.example .env
docker compose up --build
```

The default stack starts frontend, backend, agent, Ollama, and PostgreSQL.

Use `make test` for the full local test entrypoint.
