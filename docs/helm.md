# Helm

```bash
helm lint ./helm/charts/ollama-benchmark-center
helm template ollama-benchmark-center ./helm/charts/ollama-benchmark-center
helm install ollama-benchmark-center ./helm/charts/ollama-benchmark-center
helm upgrade ollama-benchmark-center ./helm/charts/ollama-benchmark-center
helm rollback ollama-benchmark-center
helm uninstall ollama-benchmark-center
```

Use `values-prod.yaml` with external PostgreSQL and ingress/TLS settings.
