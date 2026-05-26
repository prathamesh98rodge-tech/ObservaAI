import React from "react";

interface LatencyBadgeProps {
  latencyMs: number;
}

export function LatencyBadge({ latencyMs }: LatencyBadgeProps) {
  const color =
    latencyMs < 1000 ? "text-green-400" :
    latencyMs < 3000 ? "text-yellow-400" :
                       "text-red-400";
  const label = latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)}s` : `${latencyMs}ms`;
  return <span className={`font-mono text-xs ${color}`}>{label}</span>;
}
