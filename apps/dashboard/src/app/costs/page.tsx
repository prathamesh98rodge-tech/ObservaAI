"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCosts, fetchTimeline, fetchTokenUsage } from "@/lib/api";
import { formatCost, formatTokens, PROVIDER_COLORS } from "@/lib/utils";
import { ProviderDonutChart } from "@/components/charts/ProviderDonutChart";
import { CostAreaChart } from "@/components/charts/CostAreaChart";
import { DollarSign, TrendingUp, Zap } from "lucide-react";
import type { TokenUsageSummary } from "@observaai/shared-types";

// Shapes from GET /analytics/costs and GET /analytics/timeline
interface ProviderCostRow { provider: string; total_cost: number; total_tokens: number; }
interface TimelineRow { period: string; cost: number; requests: number; }

export default function CostsPage() {
  const { data: costsData = [], isLoading: costsLoading } = useQuery<ProviderCostRow[]>({
    queryKey: ["costs"],
    queryFn: fetchCosts,
    refetchInterval: 15_000,
  });
  const { data: tokenData = [] } = useQuery<TokenUsageSummary[]>({
    queryKey: ["token-usage"],
    queryFn: () => fetchTokenUsage(),
    refetchInterval: 15_000,
  });
  const { data: timeline = [], isLoading: timelineLoading } = useQuery<TimelineRow[]>({
    queryKey: ["timeline"],
    queryFn: () => fetchTimeline("hour"),
    refetchInterval: 30_000,
  });

  const totalCost = costsData.reduce((s, r) => s + r.total_cost, 0);
  const totalRequests = tokenData.reduce((s, r) => s + r.requestCount, 0);
  const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;
  const topProvider = [...costsData].sort((a, b) => b.total_cost - a.total_cost)[0];
  const isLoading = costsLoading || timelineLoading;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Costs</h2>
        <p className="text-sm text-slate-500 mt-0.5">AI spend breakdown by provider and time</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={DollarSign} label="Total Spend" value={formatCost(totalCost)} color="text-emerald-400" loading={isLoading} />
        <SummaryCard
          icon={TrendingUp}
          label="Top Provider"
          value={topProvider ? topProvider.provider.charAt(0).toUpperCase() + topProvider.provider.slice(1) : "—"}
          sub={topProvider ? formatCost(topProvider.total_cost) : undefined}
          color="text-orange-400"
          loading={isLoading}
        />
        <SummaryCard icon={Zap} label="Avg Cost / Request" value={formatCost(avgCostPerRequest)} color="text-indigo-400" loading={isLoading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Cost Distribution</h3>
          {costsLoading ? <Skeleton /> : <ProviderDonutChart data={costsData} />}
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Cost Over Time (hourly)</h3>
          {timelineLoading ? <Skeleton /> : <CostAreaChart data={timeline} />}
        </div>
      </div>

      {/* Breakdown table */}
      {costsData.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e1e2e]">
            <h3 className="text-sm font-semibold text-slate-300">Provider Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Provider", "Total Cost", "Total Tokens", "Cost / 1K Tokens", "Share"].map((col) => (
                  <th key={col} className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {[...costsData].sort((a, b) => b.total_cost - a.total_cost).map((row) => {
                const color = PROVIDER_COLORS[row.provider] ?? "#64748b";
                const costPer1K = row.total_tokens > 0 ? (row.total_cost / row.total_tokens) * 1000 : 0;
                const share = totalCost > 0 ? (row.total_cost / totalCost) * 100 : 0;
                return (
                  <tr key={row.provider} className="hover:bg-white/2">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="capitalize text-slate-200">{row.provider}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-emerald-400">{formatCost(row.total_cost)}</td>
                    <td className="px-5 py-3 font-mono text-blue-400">{formatTokens(row.total_tokens)}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">{formatCost(costPer1K)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 max-w-[80px]">
                          <div className="h-1.5 rounded-full" style={{ width: `${share}%`, background: color }} />
                        </div>
                        <span className="text-xs font-mono text-slate-400">{share.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && costsData.length === 0 && (
        <div className="card p-8 text-center text-slate-500 text-sm">
          No cost data yet — route AI calls through the gateway.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color, loading }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string; loading?: boolean;
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg bg-white/5 ${color} shrink-0`}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        {loading ? (
          <div className="h-6 w-28 bg-white/5 rounded animate-pulse" />
        ) : (
          <>
            <p className={`text-lg font-bold font-mono ${color} truncate`}>{value}</p>
            {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="h-64 animate-pulse bg-white/5 rounded-lg" />;
}
