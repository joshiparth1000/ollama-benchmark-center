# Kubernetes

Helm is the source of truth for Kubernetes. Generated manifests should be rendered with:

```bash
make k8s-render
```

Do not hand-maintain rendered YAML in `k8s/generated`.
