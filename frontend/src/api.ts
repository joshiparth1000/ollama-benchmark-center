const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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
  created_at: string;
  updated_at: string;
};

export type Recommendation = {
  config: Record<string, number | string>;
  metrics: Record<string, number | string>;
  reason: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export const api = {
  hosts: () => request<Host[]>("/api/hosts"),
  createHost: (payload: { name: string; agent_url: string }) =>
    request<Host>("/api/hosts", { method: "POST", body: JSON.stringify(payload) }),
  refreshHost: (hostId: string) => request<Record<string, unknown>>(`/api/hosts/${hostId}/refresh`, { method: "POST" }),
  models: (hostId: string) => request<{ models?: Array<{ name: string }> }>(`/api/hosts/${hostId}/models`),
  runs: () => request<BenchmarkRun[]>("/api/benchmark-runs"),
  createRun: (payload: { host_id: string; model: string; mode: string; prompt: string }) =>
    request<BenchmarkRun>("/api/benchmark-runs", { method: "POST", body: JSON.stringify(payload) }),
  run: (runId: string) => request<BenchmarkRun>(`/api/benchmark-runs/${runId}`),
  cancelRun: (runId: string) => request<BenchmarkRun>(`/api/benchmark-runs/${runId}/cancel`, { method: "POST" }),
  recommendation: (runId: string) => request<Recommendation>(`/api/benchmark-runs/${runId}/recommendation`),
  exportRun: (runId: string, kind: string) =>
    request<{ kind: string; content: string }>(`/api/benchmark-runs/${runId}/export/${kind}`)
};
