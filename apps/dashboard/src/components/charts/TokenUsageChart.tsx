"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TokenUsageSummary } from "@observaai/shared-types";
import { formatTokens } from "@/lib/utils";

interface Props {
  data: TokenUsageSummary[];
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg border p-3 text-sm shadow-xl"
      style={{
        background: "#1e1e2e",
        borderColor: "#334155",
        color: "#e2e8f0",
      }}
    >
      <p className="font-semibold capitalize mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-mono">{formatTokens(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function formatYAxis(value: number): string {
  return formatTokens(value);
}

export function TokenUsageChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No token usage data yet — route AI calls through the gateway.
      </div>
    );
  }

  // Aggregate by provider (sum across models)
  const byProvider = new Map<string, { input: number; output: number }>();
  for (const row of data) {
    const existing = byProvider.get(row.provider) ?? { input: 0, output: 0 };
    byProvider.set(row.provider, {
      input: existing.input + row.totalInputTokens,
      output: existing.output + row.totalOutputTokens,
    });
  }

  const chartData = Array.from(byProvider.entries()).map(([provider, vals]) => ({
    provider: provider.charAt(0).toUpperCase() + provider.slice(1),
    Input: vals.input,
    Output: vals.output,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis dataKey="provider" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatYAxis} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend
          wrapperStyle={{ color: "#94a3b8", fontSize: 12, paddingTop: 8 }}
        />
        <Bar dataKey="Input" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={48} />
        <Bar dataKey="Output" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
