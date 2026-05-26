"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBudgets, createBudget, updateBudget, deleteBudget } from "@/lib/api";
import { formatCost } from "@/lib/utils";
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle, XCircle, CheckCircle } from "lucide-react";

interface Budget {
  id: string;
  label: string;
  workspace_name: string;
  provider: string;
  period: string;
  limit_usd: number;
  alert_pct: number;
  spend_usd: number;
  spend_pct: number;
  level: "ok" | "warning" | "exceeded";
  webhook_url: string;
  enabled: boolean;
  notified_level: string;
  created_at: string;
}

const PROVIDER_OPTIONS = ["", "openai", "anthropic", "gemini", "ollama", "openrouter"];
const PERIOD_LABELS: Record<string, string> = { day: "Daily", week: "Weekly", month: "Monthly" };
const LEVEL_CONFIG = {
  ok:       { icon: CheckCircle,   color: "text-emerald-400", bg: "bg-emerald-400/10", label: "On track" },
  warning:  { icon: AlertTriangle, color: "text-yellow-400",  bg: "bg-yellow-400/10",  label: "Warning" },
  exceeded: { icon: XCircle,       color: "text-red-400",     bg: "bg-red-400/10",     label: "Exceeded" },
};

export default function BudgetsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: budgets = [], isLoading } = useQuery<Budget[]>({
    queryKey: ["budgets"],
    queryFn: fetchBudgets,
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: createBudget,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets"] }); setShowForm(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateBudget(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBudget,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const activeAlerts = budgets.filter((b) => b.enabled && b.level !== "ok");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Budgets</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Spend limits with automatic alerts per provider and workspace
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} />
          New Budget
        </button>
      </div>

      {/* Active alerts banner */}
      {activeAlerts.length > 0 && (
        <div className="card p-4 border border-yellow-500/20 bg-yellow-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">
              {activeAlerts.length} active alert{activeAlerts.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-1">
            {activeAlerts.map((b) => {
              const cfg = LEVEL_CONFIG[b.level];
              return (
                <div key={b.id} className="flex items-center gap-2 text-xs text-slate-300">
                  <cfg.icon size={11} className={cfg.color} />
                  <span className="font-medium">{b.label || `${b.provider || "All providers"} · ${PERIOD_LABELS[b.period]}`}</span>
                  <span className="text-slate-500">—</span>
                  <span className={`font-mono ${cfg.color}`}>
                    {formatCost(b.spend_usd)} / {formatCost(b.limit_usd)}
                    {" "}({(b.spend_pct * 100).toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <BudgetForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          loading={createMutation.isPending}
        />
      )}

      {/* Budgets list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 h-24 animate-pulse bg-white/3" />
          ))}
        </div>
      ) : budgets.length === 0 && !showForm ? (
        <div className="card p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Bell size={36} />
          <p className="text-sm">No budgets yet — create one to start tracking spend limits.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onToggle={(enabled) => toggleMutation.mutate({ id: budget.id, enabled })}
              onDelete={() => deleteMutation.mutate(budget.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Budget card ───────────────────────────────────────────────────────────────

function BudgetCard({
  budget,
  onToggle,
  onDelete,
}: {
  budget: Budget;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const cfg = LEVEL_CONFIG[budget.level];
  const LevelIcon = cfg.icon;
  const pctDisplay = Math.min(budget.spend_pct * 100, 100);
  const barColor =
    budget.level === "exceeded" ? "bg-red-500" :
    budget.level === "warning"  ? "bg-yellow-400" : "bg-indigo-500";

  return (
    <div className={`card p-5 ${!budget.enabled ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {budget.enabled && budget.level !== "ok" && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                <LevelIcon size={9} />
                {cfg.label.toUpperCase()}
              </span>
            )}
            <span className="text-sm font-semibold text-slate-100">
              {budget.label || "(no label)"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{PERIOD_LABELS[budget.period] ?? budget.period}</span>
            {budget.provider && (
              <span className="capitalize font-medium text-slate-400">{budget.provider}</span>
            )}
            {budget.workspace_name && (
              <span className="font-mono text-slate-500">{budget.workspace_name}</span>
            )}
            {!budget.provider && !budget.workspace_name && (
              <span>All providers · All workspaces</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggle(!budget.enabled)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title={budget.enabled ? "Disable" : "Enable"}
          >
            {budget.enabled
              ? <ToggleRight size={20} className="text-indigo-400" />
              : <ToggleLeft size={20} />
            }
          </button>
          <button
            onClick={onDelete}
            className="text-slate-600 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Spend bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-slate-400">
            Spent <span className={`font-mono font-semibold ${cfg.color}`}>{formatCost(budget.spend_usd)}</span>
            {" "}of <span className="font-mono text-slate-300">{formatCost(budget.limit_usd)}</span>
          </span>
          <span className={`text-xs font-mono ${cfg.color}`}>
            {(budget.spend_pct * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pctDisplay}%` }}
          />
        </div>
        <div
          className="relative mt-0.5"
          style={{ paddingLeft: `${budget.alert_pct * 100}%` }}
        >
          <span
            className="absolute text-[9px] text-slate-600 -translate-x-1/2"
            style={{ left: `${budget.alert_pct * 100}%` }}
          >
            {(budget.alert_pct * 100).toFixed(0)}% alert
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function BudgetForm({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (data: Parameters<typeof createBudget>[0]) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const [limit, setLimit] = useState("10");
  const [alertPct, setAlertPct] = useState(80);
  const [webhook, setWebhook] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limitNum = parseFloat(limit);
    if (isNaN(limitNum) || limitNum <= 0) {
      setError("Limit must be a positive number.");
      return;
    }
    setError("");
    onSubmit({
      label,
      provider,
      workspace_name: workspace,
      period,
      limit_usd: limitNum,
      alert_pct: alertPct / 100,
      webhook_url: webhook,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4 border border-indigo-500/20">
      <h3 className="text-sm font-semibold text-slate-200">New Budget</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Label (optional)">
          <input
            type="text" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Team GPT-4 monthly"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Provider (blank = all)">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className={INPUT_CLS}>
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p}>{p || "— All providers —"}</option>
            ))}
          </select>
        </Field>
        <Field label="Period">
          <select value={period} onChange={(e) => setPeriod(e.target.value as "day" | "week" | "month")} className={INPUT_CLS}>
            <option value="day">Daily (rolling 24h)</option>
            <option value="week">Weekly (rolling 7d)</option>
            <option value="month">Monthly (rolling 30d)</option>
          </select>
        </Field>
        <Field label="Spend limit (USD)">
          <input
            type="number" min="0.01" step="0.01" value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label={`Alert at ${alertPct}% of limit`}>
          <div className="flex items-center gap-3">
            <input
              type="range" min={10} max={99} value={alertPct}
              onChange={(e) => setAlertPct(Number(e.target.value))}
              className="flex-1 accent-indigo-500"
            />
            <span className="text-sm font-mono text-indigo-400 w-10 shrink-0">{alertPct}%</span>
          </div>
        </Field>
        <Field label="Workspace (blank = all)">
          <input
            type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)}
            placeholder="e.g. my-project"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Webhook URL (optional)" className="sm:col-span-2">
          <input
            type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://hooks.example.com/..."
            className={INPUT_CLS}
          />
        </Field>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button" onClick={onCancel}
          className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit" disabled={loading}
          className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          {loading ? "Creating…" : "Create Budget"}
        </button>
      </div>
    </form>
  );
}

const INPUT_CLS =
  "w-full bg-[#1a1a2e] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  );
}
