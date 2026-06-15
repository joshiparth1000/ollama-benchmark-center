const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const BACKEND_API_KEY = import.meta.env.VITE_BACKEND_API_KEY;

export type Host = {
  id: string;
  name: string;
  agent_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type BenchmarkRun = {
  id: string;
  host_id: string;
  model: string;
  mode: string;
  prompt: string;
  status: string;
  agent_benchmark_id: string | null;
  current_config?: Record<string, number | string> | null;
  progress?: Record<string, number | string> | null;
  created_at: string;
  updated_at: string;
};

export type BenchmarkResult = {
  id: string;
  run_id: string;
  config: Record<string, number | string>;
  metrics: Record<string, number | string>;
  status: string;
  error: string | null;
  gen_tps: number | null;
  latency_seconds: number | null;
  max_vram_used_mb: number | null;
  created_at: string;
};

export type Recommendation = {
  config: Record<string, number | string>;
  metrics: Record<string, number | string>;
  reason: string;
  details: {
    best_for: string;
    not_ideal_for: string[];
    examples: Array<{ task: string; fit: string; why: string }>;
    summary: string;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(BACKEND_API_KEY ? { "x-api-key": BACKEND_API_KEY } : {}),
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  hosts: () => request<Host[]>("/api/hosts"),
  createHost: (payload: { name: string; agent_url: string }) =>
    request<Host>("/api/hosts", { method: "POST", body: JSON.stringify(payload) }),
  updateHost: (hostId: string, payload: { name?: string; agent_url?: string }) =>
    request<Host>(`/api/hosts/${hostId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteHost: (hostId: string) => request<void>(`/api/hosts/${hostId}`, { method: "DELETE" }),
  refreshHost: (hostId: string) => request<Record<string, unknown>>(`/api/hosts/${hostId}/refresh`, { method: "POST" }),
  hardware: (hostId: string) => request<Record<string, unknown>>(`/api/hosts/${hostId}/hardware`),
  models: (hostId: string) => request<{ models?: Array<{ name: string }> }>(`/api/hosts/${hostId}/models`),
  runs: () => request<BenchmarkRun[]>("/api/benchmark-runs"),
  results: (runId: string) => request<BenchmarkResult[]>(`/api/benchmark-runs/${runId}/results`),
  createRun: (payload: { host_id: string; model: string; mode: string; prompt: string }) =>
    request<BenchmarkRun>("/api/benchmark-runs", { method: "POST", body: JSON.stringify(payload) }),
  run: (runId: string) => request<BenchmarkRun>(`/api/benchmark-runs/${runId}`),
  cancelRun: (runId: string) => request<BenchmarkRun>(`/api/benchmark-runs/${runId}/cancel`, { method: "POST" }),
  recommendation: (runId: string) => request<Recommendation>(`/api/benchmark-runs/${runId}/recommendation`),
  exportRun: (runId: string, kind: string) =>
    request<{ kind: string; content: string }>(`/api/benchmark-runs/${runId}/export/${kind}`)
};
