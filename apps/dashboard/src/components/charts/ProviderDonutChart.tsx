"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCost, PROVIDER_COLORS } from "@/lib/utils";

interface DataPoint {
  provider: string;
  total_cost: number;
}

interface Props {
  data: DataPoint[];
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: { fill: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div
      className="rounded-lg border p-3 text-sm shadow-xl"
      style={{
        background: "#1e1e2e",
        borderColor: "#334155",
        color: "#e2e8f0",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: entry.payload.fill }}
        />
        <span className="capitalize font-semibold">{entry.name}</span>
      </div>
      <p className="font-mono mt-1">{formatCost(entry.value)}</p>
    </div>
  );
}

// Recharts label render prop — receives center cx/cy from PieChart
interface LabelProps {
  cx: number;
  cy: number;
  total: number;
}

function renderCenterLabel(cx: number, cy: number, total: number) {
  return (
    <>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#94a3b8" fontSize={11}>
        Total
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#e2e8f0" fontSize={15} fontWeight="bold">
        {formatCost(total)}
      </text>
    </>
  );
}

export function ProviderDonutChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No cost data yet.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.total_cost, 0);

  const chartData = data.map((d) => ({
    name: d.provider.charAt(0).toUpperCase() + d.provider.slice(1),
    value: d.total_cost,
    fill: PROVIDER_COLORS[d.provider] ?? "#64748b",
  }));

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={90}
            dataKey="value"
            nameKey="name"
            paddingAngle={3}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center pointer-events-none"
        style={{ top: "12%", paddingBottom: "20%" }}
      >
        <div className="flex flex-col items-center justify-center h-full">
          <span className="text-xs text-slate-400">Total</span>
          <span className="text-base font-bold font-mono text-slate-100">{formatCost(total)}</span>
        </div>
      </div>
    </div>
  );
}
