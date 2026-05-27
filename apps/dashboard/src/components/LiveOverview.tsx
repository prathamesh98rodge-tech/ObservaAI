"use client";

import { useLiveMetrics } from "@/hooks/useLiveMetrics";
import { useMetricsStore } from "@/lib/store";
import { formatCost, formatTokens, formatLatency, PROVIDER_COLORS } from "@/lib/utils";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import { Activity, DollarSign, Zap, Layers, TrendingUp, TrendingDown, Minus, AlertTriangle, Terminal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchRateLimits, fetchForecast, fetchAnomalies, fetchLiveMetrics } from "@/lib/api";
import type { ForecastData, AnomalyEntry, CliActivity } from "@/lib/api";
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
  const { data: forecast } = useQuery<ForecastData>({
    queryKey: ["forecast"],
    queryFn: () => fetchForecast(),
    refetchInterval: 120_000,
  });
  const { data: anomalyData } = useQuery<{ anomalies: AnomalyEntry[]; baseline_n: number }>({
    queryKey: ["anomalies"],
    queryFn: () => fetchAnomalies(),
    refetchInterval: 60_000,
  });
  const { data: liveRest } = useQuery<{ cliActivity: CliActivity }>({
    queryKey: ["live-cli"],
    queryFn: () => fetchLiveMetrics(),
    refetchInterval: 30_000,
  });

  // Prefer WS data; fall back to REST
  const data = wsMetrics ?? restData;
  const cliActivity: CliActivity = liveRest?.cliActivity
    ?? { detected: [], tokensToday: 0, lastSeenAt: null };

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

      {/* Cost forecast */}
      {forecast && forecast.days_sampled > 0 && (
        <ForecastWidget forecast={forecast} />
      )}

      {/* Anomaly feed */}
      {anomalyData && anomalyData.anomalies.length > 0 && (
        <AnomalyFeed anomalies={anomalyData.anomalies} />
      )}

      {/* CLI Activity */}
      <CliActivityCard activity={cliActivity} />
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

function ForecastWidget({ forecast }: { forecast: ForecastData }) {
  const TrendIcon =
    forecast.trend === "up" ? TrendingUp :
    forecast.trend === "down" ? TrendingDown : Minus;
  const trendColor =
    forecast.trend === "up" ? "text-red-400" :
    forecast.trend === "down" ? "text-emerald-400" : "text-slate-400";
  const trendLabel =
    forecast.trend === "up" ? `+${forecast.trend_pct}% vs last week` :
    forecast.trend === "down" ? `${forecast.trend_pct}% vs last week` :
    forecast.trend === "stable" ? "Stable vs last week" : "New — not enough history";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300">Cost Forecast</h3>
        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon size={13} />
          <span>{trendLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <ForecastCell label="Daily avg" value={formatCost(forecast.daily_avg)} />
        <ForecastCell label="This week" value={formatCost(forecast.weekly_projection)} accent />
        <ForecastCell label="This month" value={formatCost(forecast.monthly_projection)} />
      </div>
      <p className="text-[10px] text-slate-600 mt-3">
        Based on {forecast.days_sampled} day{forecast.days_sampled !== 1 ? "s" : ""} of data
      </p>
    </div>
  );
}

function ForecastCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${accent ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/5"}`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-base font-bold font-mono ${accent ? "text-emerald-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}

function AnomalyFeed({ anomalies }: { anomalies: AnomalyEntry[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={14} className="text-yellow-400" />
        <h3 className="text-sm font-semibold text-slate-300">Anomalies Detected</h3>
        <span className="ml-auto text-xs text-yellow-400 font-mono">{anomalies.length} flagged</span>
      </div>
      <div className="space-y-2">
        {anomalies.map((a) => (
          <AnomalyRow key={`${a.request_id}-${a.type}`} anomaly={a} />
        ))}
      </div>
    </div>
  );
}

function AnomalyRow({ anomaly: a }: { anomaly: AnomalyEntry }) {
  const isCost = a.type === "cost_spike";
  const color = PROVIDER_COLORS[a.provider] ?? "#64748b";
  const ts = new Date(a.created_at);
  const ago = Math.round((Date.now() - ts.getTime()) / 60_000);
  const agoLabel = ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/15 text-xs">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <span className="text-slate-300 capitalize font-medium">{a.provider}</span>
        <span className="text-slate-500 font-mono ml-1.5">{a.model}</span>
      </div>
      <div className="text-right font-mono">
        <p className="text-yellow-300">
          {isCost ? formatCost(a.value) : `${a.value.toLocaleString()} tok`}
          <span className="text-slate-500 ml-1">({a.z_score}σ)</span>
        </p>
        <p className="text-slate-600 text-[10px]">
          expected {isCost ? formatCost(a.expected) : `${Math.round(a.expected).toLocaleString()} tok`}
        </p>
      </div>
      <span className="text-slate-600 shrink-0 w-12 text-right">{agoLabel}</span>
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

function CliActivityCard({ activity }: { activity: CliActivity }) {
  const { detected, tokensToday, lastSeenAt } = activity;
  const hasActivity = detected.length > 0 || tokensToday > 0;
  const lastSeen = lastSeenAt
    ? new Date(lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={16} className="text-cyan-400" />
        <h3 className="text-sm font-semibold text-slate-300">CLI Activity</h3>
        {hasActivity && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            detected
          </span>
        )}
      </div>
      {!hasActivity ? (
        <p className="text-xs text-slate-500">
          No CLI activity today. Install the VS Code extension and open a terminal to auto-route Claude CLI,
          Codex CLI, or Gemini CLI through ObservaAI.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {detected.map((cli) => (
              <span
                key={cli}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-medium"
              >
                <Terminal size={10} />
                {cli}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Tokens today</p>
              <p className="text-lg font-mono text-cyan-400">{tokensToday.toLocaleString()}</p>
            </div>
            {lastSeen && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Last seen</p>
                <p className="text-lg font-mono text-slate-300">{lastSeen}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
