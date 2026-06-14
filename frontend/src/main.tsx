import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, Box, Cpu, Download, Play, RefreshCw, Server, Settings } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, type BenchmarkRun, type Host } from "./api";
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
  const createHost = useMutation({
    mutationFn: api.createHost,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hosts"] })
  });
  const refreshHost = useMutation({
    mutationFn: api.refreshHost,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hosts"] })
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
            <div key={host.id} className="grid gap-3 rounded border border-line p-3 md:grid-cols-[1fr_auto_auto]">
              <div>
                <div className="font-medium">{host.name}</div>
                <div className="text-xs text-slate-400">{host.agent_url}</div>
              </div>
              <StatusBadge status={host.status} />
              <button onClick={() => refreshHost.mutate(host.id)}>
                <RefreshCw size={16} /> Refresh
              </button>
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
  const selectedRunId = runId || runs[0]?.id || "";
  const recommendation = useQuery({
    queryKey: ["recommendation", selectedRunId],
    queryFn: () => api.recommendation(selectedRunId),
    enabled: Boolean(selectedRunId)
  });
  const exportMutation = useMutation({ mutationFn: (kind: string) => api.exportRun(selectedRunId, kind) });
  const chartData = useMemo(() => {
    const metrics = recommendation.data?.metrics ?? {};
    return [
      { name: "Generation TPS", value: Number(metrics.gen_tps ?? 0) },
      { name: "Prompt TPS", value: Number(metrics.prompt_tps ?? 0) },
      { name: "Latency", value: Number(metrics.total_sec ?? 0) },
      { name: "VRAM MB", value: Number(metrics.max_vram_used_mb ?? 0) }
    ];
  }, [recommendation.data]);

  return (
    <Panel title="Results" icon={<BarChart3 size={18} />}>
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <select value={selectedRunId} onChange={(event) => setRunId(event.target.value)}>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.model} - {run.status}</option>)}
        </select>
        <button onClick={() => exportMutation.mutate("ollama")}>
          <Download size={16} /> Export
        </button>
      </div>
      {recommendation.isError ? <div className="empty">Recommendation appears after successful results are stored.</div> : null}
      {recommendation.data ? (
        <div className="space-y-4">
          <div className="rounded border border-line p-3">
            <div className="text-sm text-slate-400">Best config</div>
            <pre>{JSON.stringify(recommendation.data.config, null, 2)}</pre>
            <p className="text-sm text-slate-300">{recommendation.data.reason}</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid stroke="#2a333a" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#40b37c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
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
