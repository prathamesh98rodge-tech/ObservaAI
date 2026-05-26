"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  period: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

interface Props {
  data: DataPoint[];
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
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
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="font-mono">{entry.value.toLocaleString()}</span>
        </div>
      ))}
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

export function RequestsLineChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No request timeline data yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: parseHourLabel(d.period),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="label"
          tick={{ fill: "#64748b", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#334155" }} />
        <Legend
          wrapperStyle={{ color: "#94a3b8", fontSize: 12, paddingTop: 8 }}
        />
        <Line
          type="monotone"
          dataKey="requests"
          name="Requests"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#6366f1" }}
        />
        <Line
          type="monotone"
          dataKey="input_tokens"
          name="Input Tokens"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6" }}
        />
        <Line
          type="monotone"
          dataKey="output_tokens"
          name="Output Tokens"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#10b981" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
