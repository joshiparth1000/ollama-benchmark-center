# Runbook: Agent Offline

1. Check `curl http://localhost:9000/health`.
2. Confirm backend and agent share `BENCH_AGENT_API_KEY`.
3. Check Compose logs with `docker compose logs agent`.
4. Verify the backend host URL points at the reachable agent address.
