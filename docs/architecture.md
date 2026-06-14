# Architecture

Ollama Benchmark Center is a multi-service app. The frontend owns benchmark visualization, the backend owns persistence and orchestration, and benchmark agents run close to Ollama hosts.

Core flow:

```text
React UI -> Backend API -> Benchmark Agent -> Ollama API
                    |
                    +-> PostgreSQL
```

Grafana is reserved for operational health. Benchmark analysis belongs in the product UI.
