# Runbook: GPU Not Detected

1. Run `nvidia-smi` on the host.
2. Confirm NVIDIA Container Toolkit is installed.
3. Start with `docker-compose.gpu.yml`.
4. Check agent `/hardware` for detected GPUs.
