"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCost } from "@/lib/utils";

interface DataPoint {
  period: string;
  cost: number;
  requests: number;
}

interface Props {
  data: DataPoint[];
}

interface TooltipPayloadEntry {
  value: number;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const costEntry = payload.find((p) => p.dataKey === "cost");
  const reqEntry = payload.find((p) => p.dataKey === "requests");
  return (
    <div
      className="rounded-lg border p-3 text-sm shadow-xl"
      style={{
        background: "#1e1e2e",
        borderColor: "#334155",
        color: "#e2e8f0",
      }}
    >
      <p className="font-semibold mb-2">{label}</p>
      {costEntry && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-slate-400">Cost:</span>
          <span className="font-mono">{formatCost(costEntry.value)}</span>
        </div>
      )}
      {reqEntry && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
          <span className="text-slate-400">Requests:</span>
          <span className="font-mono">{reqEntry.value}</span>
        </div>
      )}
    </div>
  );
}

function parseHourLabel(period: string): string {
  try {
    const d = new Date(period);
    if (isNaN(d.getTime())) return period;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return period;
  }
}

export function CostAreaChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No cost timeline data yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: parseHourLabel(d.period),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <defs>
          {/* eslint-disable-next-line react/no-unknown-property */}
          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="label"
          tick={{ fill: "#64748b", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatCost(v)}
          tick={{ fill: "#64748b", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#334155" }} />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#costGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#f59e0b" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
