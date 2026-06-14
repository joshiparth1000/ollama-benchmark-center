# Runbook: Ollama Unavailable

1. Check `curl http://localhost:11434/api/version`.
2. Confirm the agent `OLLAMA_BASE_URL`.
3. Check `docker compose logs ollama`.
4. Pull a model before starting a benchmark.
