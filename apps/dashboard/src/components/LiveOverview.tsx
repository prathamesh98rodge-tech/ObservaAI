"use client";

import { useLiveMetrics } from "@/hooks/useLiveMetrics";
import { formatCost, formatTokens, formatLatency, PROVIDER_COLORS } from "@/lib/utils";
import { Activity, DollarSign, Zap, Layers } from "lucide-react";

export function LiveOverview() {
  const { data, isLoading, error } = useLiveMetrics();

  if (isLoading) return <LoadingState />;
  if (error) return <EmptyState />;

  const usage = data?.usageByProvider ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Live Overview</h2>
        <p className="text-sm text-slate-500 mt-0.5">Real-time AI usage across all providers</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Layers} label="Total Tokens" value={formatTokens(data?.sessionTokens ?? 0)} color="text-blue-400" />
        <StatCard icon={DollarSign} label="Total Cost" value={formatCost(data?.sessionCost ?? 0)} color="text-emerald-400" />
        <StatCard icon={Zap} label="Avg Latency" value={formatLatency(data?.avgLatencyMs ?? 0)} color="text-yellow-400" />
        <StatCard icon={Activity} label="Requests" value={String(usage.reduce((s: number, u: { requestCount: number }) => s + u.requestCount, 0))} color="text-indigo-400" />
      </div>

      {/* Per-provider rows */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e]">
          <h3 className="text-sm font-semibold text-slate-300">Provider Breakdown</h3>
        </div>
        {usage.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            No requests yet — route your AI calls through the gateway to see metrics.
          </div>
        ) : (
          <div className="divide-y divide-[#1e1e2e]">
            {usage.map((u: {
              provider: string;
              model: string;
              totalInputTokens: number;
              totalOutputTokens: number;
              totalCost: number;
              avgLatencyMs: number;
              requestCount: number;
            }) => (
              <ProviderRow key={`${u.provider}-${u.model}`} usage={u} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function ProviderRow({ usage }: { usage: {
  provider: string;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  requestCount: number;
}}) {
  const color = PROVIDER_COLORS[usage.provider] ?? "#64748b";
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-[160px]">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <div>
          <p className="text-sm font-medium text-slate-200 capitalize">{usage.provider}</p>
          <p className="text-xs text-slate-500 font-mono">{usage.model}</p>
        </div>
      </div>
      <div className="flex gap-6 text-right text-sm font-mono">
        <Metric label="Input" value={formatTokens(usage.totalInputTokens)} color="text-blue-400" />
        <Metric label="Output" value={formatTokens(usage.totalOutputTokens)} color="text-green-400" />
        <Metric label="Cost" value={formatCost(usage.totalCost)} color="text-emerald-400" />
        <Metric label="Latency" value={formatLatency(usage.avgLatencyMs)} color="text-yellow-400" />
        <Metric label="Requests" value={String(usage.requestCount)} color="text-slate-300" />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`${color} font-medium`}>{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 h-20 animate-pulse bg-white/3" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
      <Activity size={32} />
      <p className="text-sm">Gateway offline — start the gateway to see live metrics.</p>
    </div>
  );
}
