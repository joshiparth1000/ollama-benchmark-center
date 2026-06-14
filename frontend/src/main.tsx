import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, Box, ChevronDown, Cpu, Download, Play, RefreshCw, Server, Settings } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, type BenchmarkResult, type BenchmarkRun, type Host } from "./api";
import { useUiStore } from "./store";
import "./styles.css";

const queryClient = new QueryClient();
const promptTemplates = [
  {
    id: "coding_challenge",
    label: "Coding challenge",
    prompt: "Write a Python function that parses a CSV file and returns the top 10 rows sorted by a numeric column. Include edge-case handling."
  },
  {
    id: "simple_question",
    label: "Simple question",
    prompt: "What is the difference between throughput and latency in model benchmarking?"
  },
  {
    id: "summarization",
    label: "Summarization",
    prompt: "Summarize the following request in three bullet points: benchmark the model, capture resource usage, and recommend the best configuration."
  },
  {
    id: "reasoning",
    label: "Reasoning",
    prompt: "A model is faster but uses more VRAM than another. Explain when each trade-off would be preferable."
  },
  {
    id: "custom",
    label: "Custom prompt",
    prompt: ""
  }
] as const;

function StatusBadge({ status }: { status: string }) {
  const tone = status === "online" || status === "completed" ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn";
  return <span className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-line bg-panel rounded-lg border p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function HostsDashboard({ hosts }: { hosts: Host[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("Local agent");
  const [agentUrl, setAgentUrl] = useState("http://localhost:9000");
  const [expandedHostId, setExpandedHostId] = useState<string | null>(null);
  const createHost = useMutation({
    mutationFn: api.createHost,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hosts"] })
  });
  const refreshHost = useMutation({
    mutationFn: api.refreshHost,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hosts"] })
  });
  const expandedHardware = useQuery({
    queryKey: ["host-hardware", expandedHostId],
    queryFn: () => api.hardware(expandedHostId ?? ""),
    enabled: Boolean(expandedHostId)
  });

  return (
    <Panel title="Hosts" icon={<Server size={18} />}>
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} />
        <button onClick={() => createHost.mutate({ name, agent_url: agentUrl })}>
          <Box size={16} /> Add
        </button>
      </div>
      <div className="space-y-2">
        {hosts.length === 0 ? (
          <div className="empty">No hosts registered yet.</div>
        ) : (
          hosts.map((host) => (
            <div key={host.id} className="rounded border border-line p-3">
              <button
                type="button"
                className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 bg-transparent p-0 text-left"
                onClick={() => setExpandedHostId(expandedHostId === host.id ? null : host.id)}
              >
                <div>
                  <div className="font-medium">{host.name}</div>
                  <div className="text-xs text-slate-400">{host.agent_url}</div>
                </div>
                <StatusBadge status={host.status} />
                <ChevronDown
                  size={16}
                  className={`transition-transform ${expandedHostId === host.id ? "rotate-180" : ""}`}
                />
              </button>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => refreshHost.mutate(host.id)}>
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>
              {expandedHostId === host.id ? (
                <div className="mt-3 rounded border border-line bg-slate-950/40 p-3">
                  {expandedHardware.isLoading ? <div className="empty">Loading hardware details...</div> : null}
                  {expandedHardware.isError ? <div className="error">Could not load hardware details.</div> : null}
                  {expandedHardware.data ? (
                    <div className="grid gap-3">
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="rounded border border-line p-3">
                          <div className="text-xs text-slate-400">CPU</div>
                          <div className="mt-1 text-sm text-slate-200">
                            {(expandedHardware.data.cpu as { logical_count?: number; physical_count?: number } | undefined)?.logical_count ?? "n/a"} logical /{" "}
                            {(expandedHardware.data.cpu as { logical_count?: number; physical_count?: number } | undefined)?.physical_count ?? "n/a"} physical
                          </div>
                        </div>
                        <div className="rounded border border-line p-3">
                          <div className="text-xs text-slate-400">RAM</div>
                          <div className="mt-1 text-sm text-slate-200">
                            {Number(((expandedHardware.data.ram as { total_bytes?: number } | undefined)?.total_bytes ?? 0) / (1024 ** 3)).toFixed(1)} GB total
                          </div>
                        </div>
                        <div className="rounded border border-line p-3">
                          <div className="text-xs text-slate-400">GPU</div>
                          <div className="mt-1 text-sm text-slate-200">
                            {Array.isArray(expandedHardware.data.gpus) && expandedHardware.data.gpus.length > 0
                              ? `${expandedHardware.data.gpus.length} detected`
                              : "No GPU detected"}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded border border-line p-3">
                          <div className="text-xs text-slate-400">Platform</div>
                          <div className="mt-1 text-sm text-slate-200">{String(expandedHardware.data.platform ?? "n/a")}</div>
                        </div>
                        <div className="rounded border border-line p-3">
                          <div className="text-xs text-slate-400">Hostname</div>
                          <div className="mt-1 text-sm text-slate-200">{String(expandedHardware.data.hostname ?? "n/a")}</div>
                        </div>
                      </div>
                      <details className="rounded border border-line bg-panel p-3">
                        <summary className="cursor-pointer list-none text-sm font-medium text-slate-200">
                          Show raw discovered hardware
                        </summary>
                        <pre className="mt-3">{JSON.stringify(expandedHardware.data, null, 2)}</pre>
                      </details>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function BenchmarkWizard({ hosts }: { hosts: Host[] }) {
  const queryClient = useQueryClient();
  const { setActiveRunId } = useUiStore();
  const [hostId, setHostId] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("quick");
  const [promptTemplate, setPromptTemplate] = useState<(typeof promptTemplates)[number]["id"]>("simple_question");
  const [customPrompt, setCustomPrompt] = useState("");
  const selectedHostId = hostId || hosts[0]?.id || "";
  const models = useQuery({
    queryKey: ["models", selectedHostId],
    queryFn: () => api.models(selectedHostId),
    enabled: Boolean(selectedHostId)
  });
  const modelOptions = models.data?.models ?? [];
  useEffect(() => {
    setModel("");
  }, [selectedHostId]);
  useEffect(() => {
    if (modelOptions.length === 0) {
      return;
    }
    if (!model || !modelOptions.some((item) => item.name === model)) {
      setModel(modelOptions[0].name);
    }
  }, [model, modelOptions]);
  const activePrompt = promptTemplate === "custom"
    ? customPrompt
    : promptTemplates.find((item) => item.id === promptTemplate)?.prompt ?? "";
  const createRun = useMutation({
    mutationFn: api.createRun,
    onSuccess: (run) => {
      setActiveRunId(run.id);
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    }
  });

  return (
    <Panel title="Benchmark Wizard" icon={<Play size={18} />}>
      <div className="grid gap-3">
        <select value={selectedHostId} onChange={(event) => setHostId(event.target.value)}>
          {hosts.map((host) => (
            <option key={host.id} value={host.id}>{host.name}</option>
          ))}
        </select>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={!selectedHostId || models.isLoading || modelOptions.length === 0}
          >
            {!selectedHostId ? <option value="">Select a host first</option> : null}
            {models.isLoading ? <option value="">Loading models...</option> : null}
            {models.isError ? <option value="">Unable to load models</option> : null}
            {!models.isLoading && !models.isError && modelOptions.length === 0 ? <option value="">No models available</option> : null}
            {modelOptions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => models.refetch()}
            disabled={!selectedHostId || models.isFetching}
            aria-label="Refresh models"
            title="Refresh models"
          >
            <RefreshCw size={16} className={models.isFetching ? "animate-spin" : ""} />
          </button>
        </div>
        {models.isError ? <div className="text-xs text-red-300">Refresh the list or check the selected host.</div> : null}
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="quick">Quick</option>
          <option value="balanced">Balanced</option>
          <option value="exhaustive">Exhaustive</option>
        </select>
        <select
          value={promptTemplate}
          onChange={(event) => setPromptTemplate(event.target.value as (typeof promptTemplates)[number]["id"])}
        >
          {promptTemplates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        {promptTemplate === "custom" ? (
          <textarea
            value={customPrompt}
            onChange={(event) => setCustomPrompt(event.target.value)}
            placeholder="Write your own benchmark prompt."
          />
        ) : (
          <div className="rounded border border-line bg-slate-950/40 p-3 text-sm text-slate-300">
            {activePrompt}
          </div>
        )}
        <button
          disabled={!selectedHostId || !model || models.isLoading || models.isError || !activePrompt.trim()}
          onClick={() => createRun.mutate({ host_id: selectedHostId, model, mode, prompt: activePrompt })}
        >
          <Play size={16} /> Start
        </button>
      </div>
    </Panel>
  );
}

function formatConfigLabel(config: Record<string, number | string>): string {
  const gpu = Number(config.num_gpu ?? 0);
  const thread = Number(config.num_thread ?? 0);
  const predict = Number(config.num_predict ?? 0);
  const scope = gpu > 0 ? `GPU ${gpu}` : "CPU";
  return `${scope} · ${thread}t · ${predict} tok`;
}

function formatChartLabel(config: Record<string, number | string>): string {
  const gpu = Number(config.num_gpu ?? 0);
  const predict = Number(config.num_predict ?? 0);
  const scope = gpu > 0 ? `G${gpu}` : "C";
  return `${scope}-${predict}`;
}

function LiveRun({ runId }: { runId: string | null }) {
  const queryClient = useQueryClient();
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId ?? ""),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "queued" ? 2000 : false;
    }
  });
  const cancel = useMutation({
    mutationFn: api.cancelRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", runId] })
  });
  useEffect(() => {
    if (!run.data || !["completed", "failed", "cancelled"].includes(run.data.status)) {
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["runs"] });
    queryClient.invalidateQueries({ queryKey: ["recommendation", run.data.id] });
  }, [queryClient, run.data]);

  return (
    <Panel title="Live Run" icon={<Activity size={18} />}>
      {!runId ? <div className="empty">Start a benchmark to see live progress.</div> : null}
      {run.data ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{run.data.model}</div>
              <div className="text-xs text-slate-400">{run.data.id}</div>
            </div>
            <StatusBadge status={run.data.status} />
          </div>
          <div className="h-2 rounded bg-slate-800">
            <div className="h-2 rounded bg-accent" style={{ width: run.data.status === "completed" ? "100%" : "45%" }} />
          </div>
          <button onClick={() => cancel.mutate(run.data.id)}>Cancel</button>
        </div>
      ) : null}
    </Panel>
  );
}

function Results({ runs }: { runs: BenchmarkRun[] }) {
  const [runId, setRunId] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selectedRunId = runId || runs[0]?.id || "";
  const results = useQuery<BenchmarkResult[]>({
    queryKey: ["results", selectedRunId],
    queryFn: () => api.results(selectedRunId),
    enabled: Boolean(selectedRunId),
    refetchInterval: (query) => {
      const selectedStatus = runs.find((run) => run.id === selectedRunId)?.status;
      const queryStatus = query.state.data?.some((row) => row.status === "running") ? "running" : selectedStatus;
      return queryStatus === "running" || queryStatus === "queued" ? 2000 : false;
    }
  });
  const recommendation = useQuery({
    queryKey: ["recommendation", selectedRunId],
    queryFn: () => api.recommendation(selectedRunId),
    enabled: Boolean(selectedRunId)
  });
  const exportMutation = useMutation({ mutationFn: (kind: string) => api.exportRun(selectedRunId, kind) });
  const chartData = useMemo(
    () =>
      (results.data ?? [])
        .filter((row) => row.status === "completed")
        .sort((a, b) => Number(b.metrics.gen_tps ?? 0) - Number(a.metrics.gen_tps ?? 0))
        .slice(0, 6)
        .map((row) => ({
        name: formatChartLabel(row.config),
        label: formatConfigLabel(row.config),
        gen_tps: Number(row.metrics.gen_tps ?? 0),
        prompt_tps: Number(row.metrics.prompt_tps ?? 0),
        ttft_sec: Number(row.metrics.ttft_sec ?? row.metrics.load_sec ?? 0),
        total_sec: Number(row.metrics.total_sec ?? 0),
        load_sec: Number(row.metrics.load_sec ?? 0),
        vram_mb: Number(row.metrics.max_vram_used_mb ?? 0),
        cpu_pct: Number(row.metrics.cpu_usage_percent ?? 0),
        ram_pct: Number(row.metrics.ram_usage_percent ?? 0)
      })),
    [results.data]
  );
  const summary = recommendation.data?.metrics ?? {};

  return (
    <Panel title="Results" icon={<BarChart3 size={18} />}>
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <select value={selectedRunId} onChange={(event) => setRunId(event.target.value)}>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.model} - {run.status}</option>)}
        </select>
        <button onClick={() => exportMutation.mutate("ollama")} disabled={!selectedRunId}>
          <Download size={16} /> Export
        </button>
      </div>
      {recommendation.data ? (
        <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded border border-line p-3">
            <div className="text-xs text-slate-400">Best config</div>
            <div className="mt-1 font-medium">{formatConfigLabel(recommendation.data.config)}</div>
          </div>
          <div className="rounded border border-line p-3">
            <div className="text-xs text-slate-400">Generation TPS</div>
            <div className="mt-1 font-medium">{Number(summary.gen_tps ?? 0).toFixed(2)}</div>
          </div>
          <div className="rounded border border-line p-3">
            <div className="text-xs text-slate-400">Prompt TPS</div>
            <div className="mt-1 font-medium">{Number(summary.prompt_tps ?? 0).toFixed(2)}</div>
          </div>
          <div className="rounded border border-line p-3">
            <div className="text-xs text-slate-400">TTFT</div>
            <div className="mt-1 font-medium">{Number(summary.ttft_sec ?? 0).toFixed(2)} s</div>
          </div>
          <div className="rounded border border-line p-3">
            <div className="text-xs text-slate-400">Total latency</div>
            <div className="mt-1 font-medium">{Number(summary.total_sec ?? 0).toFixed(2)} s</div>
          </div>
          <div className="rounded border border-line p-3">
            <div className="text-xs text-slate-400">Peak VRAM</div>
            <div className="mt-1 font-medium">{Number(summary.max_vram_used_mb ?? 0).toFixed(0)} MB</div>
          </div>
        </div>
      ) : null}
      {recommendation.isError ? <div className="empty">Recommendation appears after successful results are stored.</div> : null}
      {results.isLoading ? <div className="empty">Loading benchmark results...</div> : null}
      {results.isError ? <div className="error">Could not load benchmark results.</div> : null}
      {chartData.length > 0 ? (
        <div className="space-y-4">
          <div className="text-xs text-slate-400">
            Charts show the top {chartData.length} completed configs by generation throughput. Open the details section for the full run.
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded border border-line p-3">
              <div className="mb-3 text-sm font-medium text-slate-300">Throughput</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-30} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="gen_tps" fill="#40b37c" name="Generation TPS" />
                    <Bar dataKey="prompt_tps" fill="#60a5fa" name="Prompt TPS" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="mb-3 text-sm font-medium text-slate-300">Latency</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-30} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="ttft_sec" fill="#f59e0b" name="TTFT" />
                    <Bar dataKey="load_sec" fill="#f97316" name="Load" />
                    <Bar dataKey="total_sec" fill="#ef4444" name="Total" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="mb-3 text-sm font-medium text-slate-300">VRAM and system load</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-30} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="vram_mb" fill="#8b5cf6" name="Peak VRAM MB" />
                    <Bar dataKey="cpu_pct" fill="#22c55e" name="CPU %" />
                    <Bar dataKey="ram_pct" fill="#14b8a6" name="RAM %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="mb-3 text-sm font-medium text-slate-300">Recommendation</div>
              <pre>{JSON.stringify(recommendation.data?.config ?? {}, null, 2)}</pre>
              <p className="text-sm text-slate-300">{recommendation.data?.reason}</p>
            </div>
          </div>
          <details className="rounded border border-line bg-panel p-3" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-200">
              {detailsOpen ? "Hide detailed results" : "Show detailed results"}
            </summary>
            <div className="mt-3 overflow-auto">
              <table className="benchmark-table w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="py-2 pr-3">Config</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">TTFT</th>
                    <th className="py-2 pr-3">Gen TPS</th>
                    <th className="py-2 pr-3">Prompt TPS</th>
                    <th className="py-2 pr-3">Latency</th>
                    <th className="py-2 pr-3">VRAM</th>
                  </tr>
                </thead>
                <tbody>
                  {(results.data ?? []).map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3">{formatConfigLabel(row.config)}</td>
                      <td className="py-2 pr-3">{row.status}</td>
                      <td className="py-2 pr-3">{Number(row.metrics.ttft_sec ?? 0).toFixed(2)} s</td>
                      <td className="py-2 pr-3">{Number(row.metrics.gen_tps ?? 0).toFixed(2)}</td>
                      <td className="py-2 pr-3">{Number(row.metrics.prompt_tps ?? 0).toFixed(2)}</td>
                      <td className="py-2 pr-3">{Number(row.metrics.total_sec ?? 0).toFixed(2)} s</td>
                      <td className="py-2 pr-3">{Number(row.metrics.max_vram_used_mb ?? 0).toFixed(0)} MB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : (
        <div className="empty">Run a benchmark to see TTFT, throughput, latency, and VRAM charts.</div>
      )}
      {exportMutation.data ? <pre className="mt-3 max-h-64 overflow-auto">{exportMutation.data.content}</pre> : null}
    </Panel>
  );
}

function App() {
  const hosts = useQuery({ queryKey: ["hosts"], queryFn: api.hosts });
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.runs, refetchInterval: 5000 });
  const { activeRunId } = useUiStore();

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1>Ollama Benchmark Center</h1>
            <p>Distributed model benchmarking, recommendations, and deployment exports.</p>
          </div>
          <div className="flex gap-2 text-sm text-slate-400">
            <Cpu size={18} /> Compose-ready MVP
          </div>
        </header>
        {hosts.isError ? <div className="error">Backend is unavailable.</div> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <HostsDashboard hosts={hosts.data ?? []} />
          <BenchmarkWizard hosts={hosts.data ?? []} />
          <LiveRun runId={activeRunId} />
          <Results runs={runs.data ?? []} />
          <Panel title="Comparison" icon={<BarChart3 size={18} />}>
            <div className="empty">Run multiple benchmarks to compare hosts and models.</div>
          </Panel>
          <Panel title="Settings" icon={<Settings size={18} />}>
            <div className="grid gap-2 text-sm text-slate-300">
              <span>Backend: {import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}</span>
              <span>Auth: API-key hooks enabled in backend and agent.</span>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
