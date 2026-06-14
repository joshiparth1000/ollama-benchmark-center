#!/usr/bin/env bash
set -euo pipefail

TAG=latest
REGISTRY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="${2%/}/"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

docker build -t "${REGISTRY}ollama-benchmark-center/frontend:${TAG}" ./frontend
docker build -t "${REGISTRY}ollama-benchmark-center/backend:${TAG}" ./backend
docker build -t "${REGISTRY}ollama-benchmark-center/agent:${TAG}" ./agent
