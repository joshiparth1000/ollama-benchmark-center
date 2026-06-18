import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  Cpu,
  Download,
  GitCompare,
  GripVertical,
  Pencil,
  Plus,
  Play,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, type BenchmarkResult, type BenchmarkRun, type Host } from "./api";
import { getRecommendationNarrative } from "./recommendation";
import { useUiStore } from "./store";
import "./styles.css";

const queryClient = new QueryClient();
const runningStatuses = new Set(["queued", "running"]);
const runDragType = "application/x-ollama-benchmark-run";

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

type HardwareData = {
  hostname?: string;
  platform?: string;
  cpu?: { logical_count?: number; physical_count?: number };
  ram?: { total_bytes?: number; used_bytes?: number; usage_percent?: number };
  gpus?: Array<{ name?: string; vram_total_mb?: number; vram_used_mb?: number; utilization_percent?: number }>;
};

type PendingDelete =
  | { kind: "host"; id: string; name: string }
  | { kind: "run"; id: string; name: string };

function StatusBadge({ status }: { status: string }) {
  const tone = status === "online" || status === "completed" ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn";
  return <span className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function formatConfigLabel(config: Record<string, number | string> | null | undefined): string {
  if (!config) {
    return "Config pending";
  }
  const gpu = Number(config.num_gpu ?? 0);
  const thread = Number(config.num_thread ?? 0);
  const predict = Number(config.num_predict ?? 0);
  const scope = gpu !== 0 ? (gpu < 0 ? "GPU full" : `GPU ${gpu}`) : "CPU";
  return `${scope} - ${thread}t - ${predict} tok`;
}

function formatChartLabel(config: Record<string, number | string>): string {
  const gpu = Number(config.num_gpu ?? 0);
  const predict = Number(config.num_predict ?? 0);
  const scope = gpu !== 0 ? (gpu < 0 ? "G-full" : `G${gpu}`) : "C";
  return `${scope}-${predict}`;
}

function formatTokens(value: number | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function metricNumber(row: BenchmarkResult | null | undefined, key: string): number {
  return Number(row?.metrics[key] ?? 0);
}

function bestCompletedResult(results: BenchmarkResult[]): BenchmarkResult | null {
  return results
    .filter((row) => row.status === "completed")
    .sort((a, b) => Number(b.metrics.gen_tps ?? 0) - Number(a.metrics.gen_tps ?? 0))[0] ?? null;
}

function Sidebar({ hosts, runs }: { hosts: Host[]; runs: BenchmarkRun[] }) {
  const queryClient = useQueryClient();
  const {
    selectedHostId,
    selectedRunId,
    expandedHostIds,
    compareOpen,
    selectHost,
    selectRun,
    toggleHostExpanded,
    setCompareOpen,
    forgetRun
  } = useUiStore();
  const [addingHost, setAddingHost] = useState(false);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [name, setName] = useState("Local agent");
  const [agentUrl, setAgentUrl] = useState("http://localhost:9000");
  const [editName, setEditName] = useState("");
  const [editAgentUrl, setEditAgentUrl] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const runsByHost = useMemo(() => {
    const grouped = new Map<string, BenchmarkRun[]>();
    for (const run of runs) {
      grouped.set(run.host_id, [...(grouped.get(run.host_id) ?? []), run]);
    }
    for (const hostRuns of grouped.values()) {
      hostRuns.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    }
    return grouped;
  }, [runs]);

  const createHost = useMutation({
    mutationFn: api.createHost,
    onSuccess: (host) => {
      setAddingHost(false);
      selectHost(host.id);
      queryClient.invalidateQueries({ queryKey: ["hosts"] });
    }
  });
  const updateHost = useMutation({
    mutationFn: ({ hostId, payload }: { hostId: string; payload: { name?: string; agent_url?: string } }) => api.updateHost(hostId, payload),
    onSuccess: (host) => {
      setEditingHostId(null);
      selectHost(host.id);
      queryClient.invalidateQueries({ queryKey: ["hosts"] });
    }
  });
  const deleteHost = useMutation({
    mutationFn: api.deleteHost,
    onSuccess: () => {
      setPendingDelete(null);
      setEditingHostId(null);
      selectHost(null);
      queryClient.invalidateQueries({ queryKey: ["hosts"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    }
  });
  const deleteRun = useMutation({
    mutationFn: api.deleteRun,
    onSuccess: (_data, runId) => {
      setPendingDelete(null);
      forgetRun(runId);
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.removeQueries({ queryKey: ["results", runId] });
      queryClient.removeQueries({ queryKey: ["recommendation", runId] });
    }
  });

  const startAdd = () => {
    setName("Local agent");
    setAgentUrl("http://localhost:9000");
    setAddingHost(true);
  };

  const saveHost = () => {
    createHost.mutate({ name, agent_url: agentUrl });
  };

  const startEdit = (host: Host) => {
    setEditingHostId(host.id);
    setEditName(host.name);
    setEditAgentUrl(host.agent_url);
  };

  const saveHostEdit = (hostId: string) => {
    updateHost.mutate({ hostId, payload: { name: editName, agent_url: editAgentUrl } });
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    if (pendingDelete.kind === "host") {
      deleteHost.mutate(pendingDelete.id);
    } else {
      deleteRun.mutate(pendingDelete.id);
    }
  };

  const deletePending = deleteHost.isPending || deleteRun.isPending;

  return (
    <aside className="flex min-h-screen flex-col border-r border-line bg-panel">
      <div className="border-b border-line p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Hosts</div>
            <div className="text-xs text-slate-400">{hosts.length} registered</div>
          </div>
          <button type="button" onClick={startAdd} title="Add host" aria-label="Add host">
            <Plus size={16} />
          </button>
        </div>
        {addingHost ? (
          <div className="mt-3 grid gap-2 rounded border border-line bg-slate-950/40 p-3">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Host name" />
            <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="Agent URL" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={saveHost} disabled={!name.trim() || !agentUrl.trim() || createHost.isPending}>
                <Check size={16} /> Save
              </button>
              <button type="button" onClick={() => setAddingHost(false)}>
                <X size={16} /> Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {hosts.length === 0 ? <div className="empty">No hosts registered yet.</div> : null}
        <div className="space-y-2">
          {hosts.map((host) => {
            const isExpanded = expandedHostIds.includes(host.id);
            const hostRuns = runsByHost.get(host.id) ?? [];
            return (
              <div key={host.id} className="rounded border border-line bg-ink/40">
                <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 p-2">
                  <button
                    type="button"
                    className="min-h-8 px-2"
                    onClick={() => toggleHostExpanded(host.id)}
                    aria-label={isExpanded ? "Collapse host" : "Expand host"}
                    title={isExpanded ? "Collapse host" : "Expand host"}
                  >
                    <ChevronDown size={15} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    type="button"
                    className={`min-h-0 justify-start border-0 bg-transparent p-0 text-left ${selectedHostId === host.id && !selectedRunId ? "text-accent" : "text-slate-100"}`}
                    onClick={() => selectHost(host.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{host.name}</span>
                    </span>
                  </button>
                  <StatusBadge status={host.status} />
                  <button
                    type="button"
                    className="min-h-8 border-0 bg-transparent px-2 text-slate-500 hover:text-red-300"
                    title="Delete host"
                    aria-label={`Delete host ${host.name}`}
                    disabled={deleteHost.isPending}
                    onClick={() => setPendingDelete({ kind: "host", id: host.id, name: host.name })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 px-12 pb-2">
                  <div className="min-w-0 flex-1 truncate text-xs text-slate-500">{host.agent_url}</div>
                  <button
                    type="button"
                    className="min-h-7 border-0 bg-transparent px-2 text-slate-500 hover:text-accent"
                    title="Edit host URL"
                    aria-label={`Edit URL for ${host.name}`}
                    onClick={() => startEdit(host)}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                {editingHostId === host.id ? (
                  <div className="mx-3 mb-3 grid gap-2 rounded border border-line bg-slate-950/40 p-3">
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Host name" />
                    <input value={editAgentUrl} onChange={(event) => setEditAgentUrl(event.target.value)} placeholder="Agent URL" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => saveHostEdit(host.id)} disabled={!editName.trim() || !editAgentUrl.trim() || updateHost.isPending}>
                        <Check size={16} /> Save
                      </button>
                      <button type="button" onClick={() => setEditingHostId(null)}>
                        <X size={16} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {isExpanded ? (
                  <div className="border-t border-line px-3 py-2">
                    {hostRuns.length === 0 ? <div className="py-2 text-xs text-slate-500">No benchmark tests yet.</div> : null}
                    <div className="space-y-1">
                      {hostRuns.map((run) => (
                        <div key={run.id} className={`grid grid-cols-[1fr_auto] items-center rounded ${selectedRunId === run.id ? "bg-accent/10" : ""}`}>
                          <button
                            type="button"
                            draggable
                            className={`min-w-0 cursor-grab justify-start rounded border-0 bg-transparent px-2 py-2 text-left active:cursor-grabbing ${selectedRunId === run.id ? "text-accent" : "text-slate-300"}`}
                            title="Drag into the compare tray"
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData(runDragType, run.id);
                              event.dataTransfer.setData("text/plain", run.id);
                            }}
                            onClick={() => {
                              selectHost(host.id);
                              selectRun(run.id);
                            }}
                          >
                            <GripVertical size={14} className="shrink-0 text-slate-600" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{run.model}</span>
                              <span className="block truncate text-xs text-slate-500">{formatDate(run.created_at)} · {run.status}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="mr-1 min-h-8 border-0 bg-transparent px-2 text-slate-500 hover:text-red-300"
                            title="Delete test run"
                            aria-label={`Delete test run ${run.model}`}
                            disabled={deleteRun.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDelete({ kind: "run", id: run.id, name: run.model });
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="sticky bottom-0 border-t border-line bg-panel p-3">
        {compareOpen ? <CompareTray runs={runs} hosts={hosts} /> : null}
        <button type="button" className="w-full" onClick={() => setCompareOpen(!compareOpen)}>
          <GitCompare size={16} /> {compareOpen ? "Hide compare" : "Compare tests"}
        </button>
      </div>
      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded border border-line bg-panel p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded bg-red-500/10 p-2 text-red-300">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-100">
                  Delete {pendingDelete.kind === "host" ? "host" : "benchmark test"}?
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  {pendingDelete.kind === "host"
                    ? `This will remove ${pendingDelete.name} and all benchmark tests stored for it.`
                    : `This will remove the benchmark test for ${pendingDelete.name} and its saved results.`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={deletePending}>
                Cancel
              </button>
              <button
                type="button"
                className="border-red-800 bg-red-950 text-red-100 hover:bg-red-900"
                onClick={confirmDelete}
                disabled={deletePending}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function CompareTray({ hosts, runs }: { hosts: Host[]; runs: BenchmarkRun[] }) {
  const { compareRunIds, setCompareRunAt, removeCompareRun, clearCompareRuns, showCompareView } = useUiStore();
  const selectedRuns = compareRunIds
    .map((runId) => runs.find((run) => run.id === runId))
    .filter((run): run is BenchmarkRun => Boolean(run));
  const slots = Array.from({ length: 4 }, (_, index) => runs.find((run) => run.id === compareRunIds[index]) ?? null);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, slot: number) => {
    event.preventDefault();
    const runId = event.dataTransfer.getData(runDragType) || event.dataTransfer.getData("text/plain");
    if (runId && runs.some((run) => run.id === runId)) {
      setCompareRunAt(slot, runId);
    }
  };

  return (
    <div className="mb-3 grid gap-2 rounded border border-line bg-slate-950/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-100">Compare tests</div>
          <div className="text-xs text-slate-500">Drop up to four completed benchmark tests.</div>
        </div>
        <button type="button" className="min-h-8 px-2" onClick={clearCompareRuns} disabled={selectedRuns.length === 0}>
          Clear
        </button>
      </div>
      <div className="grid gap-2">
        {slots.map((run, index) => {
          const host = run ? hosts.find((item) => item.id === run.host_id) : null;
          return (
            <div
              key={run?.id ?? index}
              className={`min-h-16 rounded border border-dashed p-2 ${run ? "border-accent/50 bg-accent/5" : "border-line bg-ink/50"}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, index)}
            >
              {run ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">{run.model}</div>
                    <div className="truncate text-xs text-slate-500">{host?.name ?? "Unknown host"} · {formatDate(run.created_at)}</div>
                  </div>
                  <button type="button" className="min-h-7 px-2" onClick={() => removeCompareRun(run.id)} title="Remove from compare" aria-label="Remove from compare">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex h-full min-h-11 items-center justify-center text-xs text-slate-500">Drop test {index + 1}</div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={showCompareView} disabled={selectedRuns.length < 2}>
        <GitCompare size={16} /> Compare {selectedRuns.length || ""}
      </button>
    </div>
  );
}

function HostHardwareSummary({ host }: { host: Host }) {
  const hardware = useQuery({
    queryKey: ["host-hardware", host.id],
    queryFn: () => api.hardware(host.id) as Promise<HardwareData>,
    enabled: Boolean(host.id)
  });

  return (
    <Panel title="Host Hardware" icon={<Cpu size={18} />}>
      {hardware.isLoading ? <div className="empty">Loading hardware details...</div> : null}
      {hardware.isError ? <div className="error">Could not load hardware details.</div> : null}
      {hardware.data ? (
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-line p-3">
              <div className="text-xs text-slate-400">CPU</div>
              <div className="mt-1 text-sm text-slate-200">
                {hardware.data.cpu?.logical_count ?? "n/a"} logical / {hardware.data.cpu?.physical_count ?? "n/a"} physical
              </div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="text-xs text-slate-400">RAM</div>
              <div className="mt-1 text-sm text-slate-200">
                {Number((hardware.data.ram?.total_bytes ?? 0) / 1024 ** 3).toFixed(1)} GB total
              </div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="text-xs text-slate-400">GPU</div>
              <div className="mt-1 text-sm text-slate-200">
                {hardware.data.gpus?.length ? `${hardware.data.gpus.length} detected` : "No GPU detected"}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-line p-3">
              <div className="text-xs text-slate-400">Hostname</div>
              <div className="mt-1 text-sm text-slate-200">{hardware.data.hostname ?? "n/a"}</div>
            </div>
            <div className="rounded border border-line p-3">
              <div className="text-xs text-slate-400">Platform</div>
              <div className="mt-1 text-sm text-slate-200">{hardware.data.platform ?? "n/a"}</div>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function BenchmarkWizard({ host }: { host: Host }) {
  const queryClient = useQueryClient();
  const { selectRun, expandedHostIds, toggleHostExpanded } = useUiStore();
  const [model, setModel] = useState("");
  const [mode, setMode] = useState("quick");
  const [promptTemplate, setPromptTemplate] = useState<(typeof promptTemplates)[number]["id"]>("simple_question");
  const [customPrompt, setCustomPrompt] = useState("");
  const models = useQuery({
    queryKey: ["models", host.id],
    queryFn: () => api.models(host.id),
    enabled: Boolean(host.id)
  });
  const modelOptions = models.data?.models ?? [];

  useEffect(() => {
    setModel("");
  }, [host.id]);

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
      selectRun(run.id);
      if (!expandedHostIds.includes(host.id)) {
        toggleHostExpanded(host.id);
      }
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    }
  });

  return (
    <Panel title={`Run Benchmark on ${host.name}`} icon={<Play size={18} />}>
      <div className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={models.isLoading || modelOptions.length === 0}
          >
            {models.isLoading ? <option value="">Loading models...</option> : null}
            {models.isError ? <option value="">Unable to load models</option> : null}
            {!models.isLoading && !models.isError && modelOptions.length === 0 ? <option value="">No models available</option> : null}
            {modelOptions.map((item) => (
              <option key={item.name} value={item.name}>{item.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => models.refetch()} disabled={models.isFetching} title="Refresh models" aria-label="Refresh models">
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
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        {promptTemplate === "custom" ? (
          <textarea value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} placeholder="Write your own benchmark prompt." />
        ) : (
          <div className="rounded border border-line bg-slate-950/40 p-3 text-sm text-slate-300">{activePrompt}</div>
        )}
        <button
          disabled={!model || models.isLoading || models.isError || !activePrompt.trim() || createRun.isPending}
          onClick={() => createRun.mutate({ host_id: host.id, model, mode, prompt: activePrompt })}
        >
          <Play size={16} /> Start benchmark
        </button>
      </div>
    </Panel>
  );
}

function HostWorkspace({ host, runs }: { host: Host; runs: BenchmarkRun[] }) {
  const hostRuns = runs.filter((run) => run.host_id === host.id);
  return (
    <div className="grid gap-4">
      <BenchmarkWizard host={host} />
      {hostRuns.length === 0 ? <div className="empty">No tests have been run on this host yet.</div> : null}
      <HostHardwareSummary host={host} />
    </div>
  );
}

function RunResults({ run }: { run: BenchmarkRun }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const results = useQuery<BenchmarkResult[]>({
    queryKey: ["results", run.id],
    queryFn: () => api.results(run.id),
    refetchInterval: runningStatuses.has(run.status) ? 2000 : false
  });
  const completedResults = useMemo(
    () => (results.data ?? []).filter((row) => row.status === "completed"),
    [results.data]
  );
  const recommendation = useQuery({
    queryKey: ["recommendation", run.id],
    queryFn: () => api.recommendation(run.id),
    enabled: run.status === "completed" && completedResults.length > 0
  });
  const exportMutation = useMutation({ mutationFn: (kind: string) => api.exportRun(run.id, kind) });
  const recommendationNarrative = useMemo(() => getRecommendationNarrative(recommendation.data), [recommendation.data]);
  const summary = recommendation.data?.metrics ?? {};
  const chartData = useMemo(
    () =>
      completedResults
        .slice()
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
          ram_mb: Number(row.metrics.ram_used_bytes ?? 0) / 1024 / 1024,
          cpu_pct: Number(row.metrics.cpu_usage_percent ?? 0),
          ram_pct: Number(row.metrics.ram_usage_percent ?? 0)
        })),
    [completedResults]
  );

  return (
    <div className="grid gap-4">
      <Panel title={run.model} icon={<BarChart3 size={18} />}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">{run.mode} · {formatDate(run.created_at)}</div>
            <div className="mt-1 text-xs text-slate-500">{run.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <button type="button" onClick={() => exportMutation.mutate("ollama")} disabled={!completedResults.length}>
              <Download size={16} /> Export
            </button>
          </div>
        </div>
        <div className="mb-4 rounded border border-line p-3">
          <div className="mb-3 text-sm font-medium text-slate-300">Recommendation</div>
          {recommendation.data ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded border border-line p-3">
                <div className="text-xs text-slate-400">Best config</div>
                <div className="mt-1 font-medium">{formatConfigLabel(recommendation.data.config)}</div>
              </div>
              <div className="rounded border border-line p-3">
                <div className="text-xs text-slate-400">Best for</div>
                <div className="mt-1 font-medium">{recommendationNarrative?.bestFor ?? "n/a"}</div>
              </div>
              <div className="rounded border border-line p-3">
                <div className="text-xs text-slate-400">Generation TPS</div>
                <div className="mt-1 font-medium">{Number(summary.gen_tps ?? 0).toFixed(2)}</div>
              </div>
              <div className="rounded border border-line p-3">
                <div className="text-xs text-slate-400">Recommended context</div>
                <div className="mt-1 font-medium">{formatTokens(recommendationNarrative?.recommendedContext)} tokens</div>
              </div>
              <div className="rounded border border-line p-3">
                <div className="text-xs text-slate-400">Max tested context</div>
                <div className="mt-1 font-medium">{formatTokens(recommendationNarrative?.maxTestedContext)} tokens</div>
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
                <div className="text-xs text-slate-400">Peak VRAM</div>
                <div className="mt-1 font-medium">{Number(summary.max_vram_used_mb ?? 0).toFixed(0)} MB</div>
              </div>
              <div className="rounded border border-line p-3 xl:col-span-3">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <div className="text-xs text-slate-400">What this means</div>
                    <p className="mt-1 text-sm text-slate-200">{recommendationNarrative?.summary ?? recommendation.data.reason}</p>
                    {recommendationNarrative?.contextWindowNote ? (
                      <p className="mt-2 text-sm text-slate-300">{recommendationNarrative.contextWindowNote}</p>
                    ) : null}
                    <p className="mt-3 text-xs uppercase text-slate-500">Why we picked it</p>
                    <p className="mt-1 text-sm text-slate-300">{recommendation.data.reason}</p>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Not ideal for</div>
                    <ul className="mt-2 space-y-2 text-sm text-slate-300">
                      {(recommendationNarrative?.notIdealFor ?? []).map((item) => (
                        <li key={item} className="rounded border border-line/60 bg-slate-950/30 px-3 py-2">{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div className="rounded border border-line p-3 xl:col-span-3">
                <div className="text-xs text-slate-400">Examples of what it can handle</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(recommendationNarrative?.examples ?? []).map((item) => (
                  <div key={item.task} className="rounded border border-line/60 bg-slate-950/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-100">{item.task}</div>
                        <div className="text-xs text-accent">{item.fit}</div>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">{item.why}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-line p-3 xl:col-span-3">
              <div className="text-xs text-slate-400">Recommended JSON</div>
              <pre className="mt-3">{JSON.stringify(recommendation.data.config, null, 2)}</pre>
            </div>
          </div>
        ) : completedResults.length > 0 ? (
            <div className={recommendation.isError ? "error" : "empty"}>
              {recommendation.isError ? "Could not load the recommendation for this run." : "Preparing recommendation from completed results..."}
            </div>
          ) : (
            <div className="empty">Recommendation appears after successful results are stored.</div>
          )}
        </div>
        {results.isLoading ? <div className="empty">Loading benchmark results...</div> : null}
        {results.isError ? <div className="error">Could not load benchmark results.</div> : null}
        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded border border-line p-3">
                <div className="mb-3 text-sm font-medium text-slate-300">Throughput</div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-30} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }} labelStyle={{ color: "#e2e8f0" }} />
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
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }} labelStyle={{ color: "#e2e8f0" }} />
                      <Bar dataKey="ttft_sec" fill="#f59e0b" name="TTFT" />
                      <Bar dataKey="load_sec" fill="#f97316" name="Load" />
                      <Bar dataKey="total_sec" fill="#ef4444" name="Total" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded border border-line p-3 xl:col-span-2">
                <div className="mb-3 text-sm font-medium text-slate-300">VRAM, RAM, and system load</div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-30} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis yAxisId="memory" stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <YAxis yAxisId="percent" orientation="right" domain={[0, 100]} stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }} labelStyle={{ color: "#e2e8f0" }} />
                      <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                      <Bar yAxisId="memory" dataKey="vram_mb" fill="#8b5cf6" name="Peak VRAM MB" />
                      <Bar yAxisId="memory" dataKey="ram_mb" fill="#14b8a6" name="RAM used MB" />
                      <Bar yAxisId="percent" dataKey="cpu_pct" fill="#22c55e" name="CPU %" />
                      <Bar yAxisId="percent" dataKey="ram_pct" fill="#f59e0b" name="RAM %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
                      <th className="py-2 pr-3">RAM</th>
                      <th className="py-2 pr-3">CPU</th>
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
                        <td className="py-2 pr-3">{(Number(row.metrics.ram_used_bytes ?? 0) / 1024 / 1024).toFixed(0)} MB</td>
                        <td className="py-2 pr-3">{Number(row.metrics.cpu_usage_percent ?? 0).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : (
          <div className="empty">Waiting for completed benchmark results.</div>
        )}
        {exportMutation.data ? <pre className="mt-3 max-h-64 overflow-auto">{exportMutation.data.content}</pre> : null}
      </Panel>
    </div>
  );
}

function CompareView({ hosts, runs }: { hosts: Host[]; runs: BenchmarkRun[] }) {
  const { compareRunIds, removeCompareRun, setCompareOpen } = useUiStore();
  const selectedRuns = compareRunIds
    .map((runId) => runs.find((run) => run.id === runId))
    .filter((run): run is BenchmarkRun => Boolean(run));
  const resultQueries = useQueries({
    queries: selectedRuns.map((run) => ({
      queryKey: ["results", run.id],
      queryFn: () => api.results(run.id)
    }))
  });
  const rows = selectedRuns.map((run, index) => {
    const host = hosts.find((item) => item.id === run.host_id) ?? null;
    const results = (resultQueries[index]?.data as BenchmarkResult[] | undefined) ?? [];
    return {
      run,
      host,
      best: bestCompletedResult(results),
      loading: resultQueries[index]?.isLoading ?? false,
      error: resultQueries[index]?.isError ?? false,
      resultCount: results.length
    };
  });
  const chartData = rows
    .filter((row) => row.best)
    .map((row, index) => ({
      name: `${index + 1}. ${row.run.model}`,
      host: row.host?.name ?? "Unknown host",
      config: formatConfigLabel(row.best?.config),
      gen_tps: metricNumber(row.best, "gen_tps"),
      prompt_tps: metricNumber(row.best, "prompt_tps"),
      ttft_sec: metricNumber(row.best, "ttft_sec") || metricNumber(row.best, "load_sec"),
      total_sec: metricNumber(row.best, "total_sec"),
      vram_mb: metricNumber(row.best, "max_vram_used_mb")
    }));

  if (selectedRuns.length < 2) {
    return (
      <Panel title="Compare Benchmarks" icon={<GitCompare size={18} />}>
        <div className="empty">
          Open Compare tests in the sidebar and drop at least two benchmark tests into the slots.
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      <Panel title="Compare Benchmarks" icon={<GitCompare size={18} />}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">{selectedRuns.length} benchmark tests selected</div>
            <div className="mt-1 text-xs text-slate-500">Comparison uses the fastest completed config from each test.</div>
          </div>
          <button type="button" onClick={() => setCompareOpen(true)}>
            <GitCompare size={16} /> Edit selection
          </button>
        </div>
        {rows.some((row) => row.loading) ? <div className="empty">Loading comparison results...</div> : null}
        {rows.some((row) => row.error) ? <div className="error">Some benchmark results could not be loaded.</div> : null}
        {chartData.length > 0 ? (
          <div className="grid gap-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded border border-line p-3">
                <div className="mb-3 text-sm font-medium text-slate-300">Throughput</div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-25} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }} labelStyle={{ color: "#e2e8f0" }} />
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
                      <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-25} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }} labelStyle={{ color: "#e2e8f0" }} />
                      <Bar dataKey="ttft_sec" fill="#f59e0b" name="TTFT" />
                      <Bar dataKey="total_sec" fill="#ef4444" name="Total seconds" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded border border-line p-3 xl:col-span-2">
                <div className="mb-3 text-sm font-medium text-slate-300">Peak VRAM</div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#31404a" strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="#cbd5e1" interval={0} angle={-25} textAnchor="end" height={90} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                      <YAxis stroke="#cbd5e1" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0" }} labelStyle={{ color: "#e2e8f0" }} />
                      <Bar dataKey="vram_mb" fill="#8b5cf6" name="Peak VRAM MB" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="overflow-auto rounded border border-line">
              <table className="benchmark-table w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="py-2 pl-3 pr-3">Test</th>
                    <th className="py-2 pr-3">Host</th>
                    <th className="py-2 pr-3">Best config</th>
                    <th className="py-2 pr-3">Gen TPS</th>
                    <th className="py-2 pr-3">Prompt TPS</th>
                    <th className="py-2 pr-3">TTFT</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">VRAM</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.run.id}>
                      <td className="py-2 pl-3 pr-3">{row.run.model}</td>
                      <td className="py-2 pr-3">{row.host?.name ?? "Unknown"}</td>
                      <td className="py-2 pr-3">{row.best ? formatConfigLabel(row.best.config) : "No completed result"}</td>
                      <td className="py-2 pr-3">{metricNumber(row.best, "gen_tps").toFixed(2)}</td>
                      <td className="py-2 pr-3">{metricNumber(row.best, "prompt_tps").toFixed(2)}</td>
                      <td className="py-2 pr-3">{(metricNumber(row.best, "ttft_sec") || metricNumber(row.best, "load_sec")).toFixed(2)} s</td>
                      <td className="py-2 pr-3">{metricNumber(row.best, "total_sec").toFixed(2)} s</td>
                      <td className="py-2 pr-3">{metricNumber(row.best, "max_vram_used_mb").toFixed(0)} MB</td>
                      <td className="py-2 pr-3">
                        <button type="button" className="min-h-8 px-2" onClick={() => removeCompareRun(row.run.id)}>
                          <X size={14} /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : rows.some((row) => row.loading) ? null : (
          <div className="empty">No completed benchmark results are available for the selected tests.</div>
        )}
      </Panel>
    </div>
  );
}

function RunningIndicator({ hosts, runs }: { hosts: Host[]; runs: BenchmarkRun[] }) {
  const queryClient = useQueryClient();
  const { runningPopoverOpen, setRunningPopoverOpen, selectHost, selectRun } = useUiStore();
  const activeRuns = runs.filter((run) => runningStatuses.has(run.status));
  const liveRuns = useQueries({
    queries: activeRuns.map((run) => ({
      queryKey: ["run", run.id, "live"],
      queryFn: () => api.run(run.id),
      refetchInterval: 2000
    }))
  });
  const cancel = useMutation({
    mutationFn: api.cancelRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    }
  });

  return (
    <div className="relative">
      <button type="button" onClick={() => setRunningPopoverOpen(!runningPopoverOpen)}>
        <Activity size={16} /> {activeRuns.length} running
      </button>
      {runningPopoverOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded border border-line bg-panel p-3 shadow-xl">
          {activeRuns.length === 0 ? <div className="empty">No tests are running.</div> : null}
          <div className="grid gap-2">
            {activeRuns.map((run, index) => {
              const host = hosts.find((item) => item.id === run.host_id);
              const liveRun = liveRuns[index]?.data ?? run;
              const title = [
                `Host: ${host?.name ?? "Unknown"} (${host?.agent_url ?? "n/a"})`,
                `Model: ${run.model}`,
                `Mode: ${run.mode}`,
                `Config: ${JSON.stringify(liveRun.current_config ?? {}, null, 2)}`
              ].join("\n");
              return (
                <div key={run.id} className="rounded border border-line bg-slate-950/40 p-3" title={title}>
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-h-0 justify-start border-0 bg-transparent p-0 text-left"
                      onClick={() => {
                        selectHost(run.host_id);
                        selectRun(run.id);
                      }}
                    >
                      <span>
                        <span className="block text-sm font-medium text-slate-100">{run.model}</span>
                        <span className="block text-xs text-slate-400">{host?.name ?? "Unknown host"} · {liveRun.status}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => cancel.mutate(run.id)} disabled={cancel.isPending}>
                      <X size={16} /> Cancel
                    </button>
                  </div>
                  <div className="mt-3 h-2 rounded bg-slate-800">
                    <div className="h-2 rounded bg-accent" style={{ width: liveRun.status === "queued" ? "25%" : "60%" }} />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{formatConfigLabel(liveRun.current_config)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MainPane({ hosts, runs }: { hosts: Host[]; runs: BenchmarkRun[] }) {
  const { selectedHostId, selectedRunId, compareViewOpen } = useUiStore();
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? (selectedRun ? hosts.find((host) => host.id === selectedRun.host_id) ?? null : null);

  if (compareViewOpen) {
    return <CompareView hosts={hosts} runs={runs} />;
  }
  if (selectedRun) {
    return <RunResults run={selectedRun} />;
  }
  if (selectedHost) {
    return <HostWorkspace host={selectedHost} runs={runs} />;
  }
  return <div className="empty">Select a host from the sidebar or add a new host to begin.</div>;
}

function App() {
  const hosts = useQuery({ queryKey: ["hosts"], queryFn: api.hosts });
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.runs, refetchInterval: 5000 });
  const { selectedHostId, compareViewOpen, selectHost } = useUiStore();
  const hostIds = useMemo(() => (hosts.data ?? []).map((host) => host.id).join(","), [hosts.data]);

  useEffect(() => {
    const hostList = hosts.data ?? [];
    if (compareViewOpen || hostList.length === 0) {
      return;
    }
    if (!selectedHostId || !hostList.some((host) => host.id === selectedHostId)) {
      selectHost(hostList[0].id);
    }
  }, [compareViewOpen, hosts.data, selectedHostId, selectHost]);

  useEffect(() => {
    const ids = hostIds ? hostIds.split(",") : [];
    if (ids.length === 0) {
      return undefined;
    }
    let cancelled = false;
    const checkStatuses = () => {
      for (const hostId of ids) {
        api.checkHostStatus(hostId)
          .then((updatedHost) => {
            if (cancelled) {
              return;
            }
            queryClient.setQueryData<Host[]>(["hosts"], (currentHosts) =>
              (currentHosts ?? []).map((item) => (item.id === updatedHost.id ? updatedHost : item))
            );
          })
          .catch(() => undefined);
      }
    };
    checkStatuses();
    const intervalId = window.setInterval(checkStatuses, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hostIds]);

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[22rem_1fr]">
        <Sidebar hosts={hosts.data ?? []} runs={runs.data ?? []} />
        <section className="min-w-0">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-ink/95 px-5 py-4 backdrop-blur">
            <div>
              <h1>Ollama Benchmark Center</h1>
              <p>Hosts, benchmark runs, recommendations, and deployment exports.</p>
            </div>
            <RunningIndicator hosts={hosts.data ?? []} runs={runs.data ?? []} />
          </header>
          <div className="p-5">
            {hosts.isError ? <div className="error">Backend is unavailable.</div> : null}
            {runs.isError ? <div className="error">Could not load benchmark runs.</div> : null}
            <MainPane hosts={hosts.data ?? []} runs={runs.data ?? []} />
          </div>
        </section>
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
