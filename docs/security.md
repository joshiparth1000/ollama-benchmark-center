# Security

- Do not commit `.env`.
- Agent endpoints use `BENCH_AGENT_API_KEY`.
- Secrets are stored in Kubernetes Secrets.
- Containers run without privileged mode by default.
- The agent does not expose a generic shell API.
- Subprocess use is restricted to controlled command arrays with timeouts.
