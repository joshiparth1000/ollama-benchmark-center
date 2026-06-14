# Recommendations

The backend recommendation engine:

1. Ignores failed tests.
2. Rejects configs above 95% VRAM usage when GPU total is known.
3. Selects highest average generation TPS.
4. Breaks close ties by lower VRAM, then lower latency, then lower `num_gpu`.
5. Generates an explanation for the selected config.
