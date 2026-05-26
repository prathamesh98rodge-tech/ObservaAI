"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTokenUsage } from "@/lib/api";
import { formatCost, formatTokens, formatLatency, PROVIDER_COLORS } from "@/lib/utils";
import { TokenUsageChart } from "@/components/charts/TokenUsageChart";
import type { TokenUsageSummary } from "@observaai/shared-types";

interface AggregatedProvider {
  provider: string;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  requestCount: number;
}

export default function ProvidersPage() {
  const { data, isLoading, error } = useQuery<TokenUsageSummary[]>({
    queryKey: ["token-usage"],
    queryFn: () => fetchTokenUsage(),
    refetchInterval: 15_000,
  });

  const rows: TokenUsageSummary[] = (data as TokenUsageSummary[] | undefined) ?? [];

  // Aggregate across models per provider
  const providerMap = new Map<string, AggregatedProvider>();
  for (const row of rows) {
    const existing = providerMap.get(row.provider);
    if (existing) {
      existing.totalInputTokens += row.totalInputTokens;
      existing.totalOutputTokens += row.totalOutputTokens;
      existing.totalTokens += row.totalInputTokens + row.totalOutputTokens;
      existing.totalCost += row.totalCost;
      existing.requestCount += row.requestCount;
      // Weighted average latency
      const totalReqs = existing.requestCount;
      existing.avgLatencyMs =
        totalReqs > 0
          ? (existing.avgLatencyMs * (totalReqs - row.requestCount) +
              row.avgLatencyMs * row.requestCount) /
            totalReqs
          : row.avgLatencyMs;
    } else {
      providerMap.set(row.provider, {
        provider: row.provider,
        totalTokens: row.totalInputTokens + row.totalOutputTokens,
        totalInputTokens: row.totalInputTokens,
        totalOutputTokens: row.totalOutputTokens,
        totalCost: row.totalCost,
        avgLatencyMs: row.avgLatencyMs,
        requestCount: row.requestCount,
      });
    }
  }
  const providerCards = Array.from(providerMap.values());

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Providers</h2>
        <p className="text-sm text-slate-500 mt-1">Per-provider token and cost analytics</p>
      </div>

      {/* Token usage chart */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Token Usage by Provider</h3>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm animate-pulse">
            Loading…
          </div>
        ) : error ? (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
            Failed to load token data.
          </div>
        ) : (
          <TokenUsageChart data={rows} />
        )}
      </div>

      {/* Provider cards */}
      {!isLoading && !error && (
        <>
          {providerCards.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 text-sm">
              No provider data yet — route AI calls through the gateway.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {providerCards.map((p) => (
                <ProviderCard key={p.provider} provider={p} />
              ))}
            </div>
          )}

          {/* Detailed model table */}
          {rows.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1e1e2e]">
                <h3 className="text-sm font-semibold text-slate-300">Model Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      {["Provider", "Model", "Input Tokens", "Output Tokens", "Cost", "Avg Latency", "Requests"].map(
                        (col) => (
                          <th
                            key={col}
                            className="px-5 py-3 text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold"
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e2e]">
                    {rows.map((row) => {
                      const color = PROVIDER_COLORS[row.provider] ?? "#64748b";
                      return (
                        <tr key={`${row.provider}-${row.model}`} className="hover:bg-white/2">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: color }}
                              />
                              <span className="capitalize text-slate-200">{row.provider}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 font-mono text-slate-400 text-xs">{row.model}</td>
                          <td className="px-5 py-3 font-mono text-blue-400">
                            {formatTokens(row.totalInputTokens)}
                          </td>
                          <td className="px-5 py-3 font-mono text-green-400">
                            {formatTokens(row.totalOutputTokens)}
                          </td>
                          <td className="px-5 py-3 font-mono text-emerald-400">
                            {formatCost(row.totalCost)}
                          </td>
                          <td className="px-5 py-3 font-mono text-yellow-400">
                            {formatLatency(row.avgLatencyMs)}
                          </td>
                          <td className="px-5 py-3 font-mono text-slate-300">{row.requestCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProviderCard({ provider: p }: { provider: AggregatedProvider }) {
  const color = PROVIDER_COLORS[p.provider] ?? "#64748b";
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <h4 className="text-base font-semibold text-slate-100 capitalize">{p.provider}</h4>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Total Tokens" value={formatTokens(p.totalTokens)} color="text-blue-400" />
        <Stat label="Total Cost" value={formatCost(p.totalCost)} color="text-emerald-400" />
        <Stat label="Avg Latency" value={formatLatency(p.avgLatencyMs)} color="text-yellow-400" />
        <Stat label="Requests" value={String(p.requestCount)} color="text-indigo-400" />
      </div>
      <div className="pt-2 border-t border-[#1e1e2e] flex justify-between text-xs font-mono text-slate-500">
        <span>
          In: <span className="text-blue-400">{formatTokens(p.totalInputTokens)}</span>
        </span>
        <span>
          Out: <span className="text-green-400">{formatTokens(p.totalOutputTokens)}</span>
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`font-mono font-semibold ${color}`}>{value}</p>
    </div>
  );
}
