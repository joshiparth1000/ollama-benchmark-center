#!/usr/bin/env bash
set -euo pipefail
helm template ollama-benchmark-center ./helm/charts/ollama-benchmark-center > k8s/generated/ollama-benchmark-center.yaml
