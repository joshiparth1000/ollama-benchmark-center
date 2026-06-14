# Benchmarking

Agents benchmark through Ollama `/api/generate` with `stream: false`.

Captured Ollama metrics:

- `total_duration`
- `load_duration`
- `prompt_eval_count`
- `prompt_eval_duration`
- `eval_count`
- `eval_duration`

Computed metrics:

- total seconds
- load seconds
- prompt tokens/sec
- generation tokens/sec
- output token count
