import React from "react";

interface TokenCounterProps {
  input: number;
  output: number;
  cached?: number;
}

export function TokenCounter({ input, output, cached }: TokenCounterProps) {
  return (
    <div className="flex gap-3 text-sm font-mono">
      <span className="text-blue-400">{input.toLocaleString()} in</span>
      <span className="text-green-400">{output.toLocaleString()} out</span>
      {cached != null && cached > 0 && (
        <span className="text-yellow-400">{cached.toLocaleString()} cached</span>
      )}
    </div>
  );
}
