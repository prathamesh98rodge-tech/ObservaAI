"use client";

import { useLiveMetrics } from "@/hooks/useLiveMetrics";
import { useMetricsStore } from "@/lib/store";
import { formatCost, formatTokens, formatLatency, PROVIDER_COLORS } from "@/lib/utils";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import { Activity, DollarSign, Zap, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchRateLimits } from "@/lib/api";
import type { TokenUsageSummary } from "@observaai/shared-types";

interface RateLimitEntry {
  provider: string;
  tokens_5h: number;
  tokens_7d: number;
  reset_5h_at: string;
  reset_7d_at: string;
}

export function LiveOverview() {
  const isConnected = useMetricsStore((s) => s.isConnected);
  const wsMetrics = useMetricsStore((s) => s.metrics);
  const { data: restData, isLoading, error } = useLiveMetrics();
  const { data: rateLimits } = useQuery<RateLimitEntry[]>({
    queryKey: ["rate-limits"],
    queryFn: () => fetchRateLimits(),
    refetchInterval: 60_000,
  });

  // Prefer WS data; fall back to REST
  const data = wsMetrics ?? restData;

  if (!wsMetrics && isLoading) return <LoadingState />;
  if (!wsMetrics && error && !data) return <EmptyState />;

  const usage: TokenUsageSummary[] = data?.usageByProvider ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Live Overview</h2>
          <p className="text-sm text-slate-500 mt-0.5">Real-time AI usage across all providers</p>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span className={isConnected ? "text-green-400" : "text-slate-500"}>
            {isConnected ? "Live" : "Polling"}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Layers}
          label="Total Tokens"
          value={formatTokens(data?.sessionTokens ?? 0)}
          color="text-blue-400"
        />
        <StatCard
          icon={DollarSign}
          label="Total Cost"
          value={formatCost(data?.sessionCost ?? 0)}
          color="text-emerald-400"
        />
        <StatCard
          icon={Zap}
          label="Avg Latency"
          value={formatLatency(data?.avgLatencyMs ?? 0)}
          color="text-yellow-400"
        />
        <StatCard
          icon={Activity}
          label="Requests"
          value={String(
            usage.reduce((s, u) => s + u.requestCount, 0)
          )}
          color="text-indigo-400"
        />
      </div>

      {/* Per-provider table */}
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
            {usage.map((u) => (
              <ProviderRow key={`${u.provider}-${u.model}`} usage={u} />
            ))}
          </div>
        )}
      </div>

      {/* Token usage chart */}
      {usage.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Token Usage by Provider</h3>
          <TokenUsageChart data={usage} />
        </div>
      )}

      {/* Rolling rate-limit windows */}
      {rateLimits && rateLimits.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Rolling Token Windows</h3>
          <div className="space-y-3">
            {rateLimits.map((entry) => (
              <RateLimitRow key={entry.provider} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
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

function ProviderRow({ usage }: { usage: TokenUsageSummary }) {
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

function RateLimitRow({ entry }: { entry: RateLimitEntry }) {
  const color = PROVIDER_COLORS[entry.provider] ?? "#64748b";
  const reset5h = new Date(entry.reset_5h_at);
  const now = Date.now();
  const minsUntil5h = Math.max(0, Math.round((reset5h.getTime() - now) / 60_000));
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 w-28 shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs text-slate-300 capitalize">{entry.provider}</span>
      </div>
      <div className="flex gap-6 text-xs font-mono">
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Last 5h</p>
          <p className="text-blue-400">{formatTokens(entry.tokens_5h)}</p>
          <p className="text-[10px] text-slate-600">resets in {minsUntil5h}m</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Last 7d</p>
          <p className="text-indigo-400">{formatTokens(entry.tokens_7d)}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 h-20 animate-pulse bg-white/5" />
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
