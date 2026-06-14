import json


def render_export(kind: str, model: str, config: dict) -> str:
    options = {
        "num_gpu": config.get("num_gpu", 0),
        "num_thread": config.get("num_thread", 4),
        "num_ctx": config.get("num_ctx", 4096),
        "num_batch": config.get("num_batch", 512),
        "temperature": config.get("temperature", 0.2),
    }
    if kind == "ollama":
        return json.dumps(options, indent=2)
    if kind == "modelfile":
        return "\n".join(
            [
                f"FROM {model}",
                "",
                f"PARAMETER num_ctx {options['num_ctx']}",
                f"PARAMETER num_gpu {options['num_gpu']}",
                f"PARAMETER num_thread {options['num_thread']}",
                f"PARAMETER num_batch {options['num_batch']}",
                f"PARAMETER temperature {options['temperature']}",
            ]
        )
    if kind == "llamacpp":
        return (
            "llama-server \\\n"
            "  -m /models/model.gguf \\\n"
            "  --host 0.0.0.0 \\\n"
            "  --port 8080 \\\n"
            f"  -ngl {options['num_gpu']} \\\n"
            f"  -t {options['num_thread']} \\\n"
            f"  -c {options['num_ctx']} \\\n"
            f"  -b {options['num_batch']}"
        )
    if kind == "docker-compose":
        return f"""services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    environment:
      OLLAMA_KEEP_ALIVE: 24h
    volumes:
      - ollama:/root/.ollama
volumes:
  ollama:
# Recommended options for {model}: {json.dumps(options)}
"""
    if kind == "kubernetes":
        return f"""apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ollama
  template:
    metadata:
      labels:
        app: ollama
    spec:
      containers:
        - name: ollama
          image: ollama/ollama:latest
          ports:
            - containerPort: 11434
---
apiVersion: v1
kind: Service
metadata:
  name: ollama
spec:
  selector:
    app: ollama
  ports:
    - port: 11434
      targetPort: 11434
# Recommended options for {model}: {json.dumps(options)}
"""
    if kind == "helm-values":
        return f"""ollama:
  model: {model}
  options:
    numGpu: {options['num_gpu']}
    numThread: {options['num_thread']}
    numCtx: {options['num_ctx']}
    numBatch: {options['num_batch']}
    temperature: {options['temperature']}
"""
    raise ValueError(f"Unsupported export kind: {kind}")
