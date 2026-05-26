import React from "react";

interface CostDisplayProps {
  cost: number;
  size?: "sm" | "md" | "lg";
}

export function CostDisplay({ cost, size = "md" }: CostDisplayProps) {
  const sizeClasses = { sm: "text-xs", md: "text-sm", lg: "text-base" };
  const formatted = cost < 0.01 ? `<$0.01` : `$${cost.toFixed(4)}`;
  return (
    <span className={`font-mono font-medium text-emerald-400 ${sizeClasses[size]}`}>
      {formatted}
    </span>
  );
}
