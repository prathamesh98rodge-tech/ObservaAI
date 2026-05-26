import React from "react";
import type { Provider } from "@observaai/shared-types";

const PROVIDER_COLORS: Record<Provider, string> = {
  openai:      "bg-green-100 text-green-800",
  anthropic:   "bg-orange-100 text-orange-800",
  gemini:      "bg-blue-100 text-blue-800",
  ollama:      "bg-purple-100 text-purple-800",
  openrouter:  "bg-gray-100 text-gray-800",
};

const PROVIDER_LABELS: Record<Provider, string> = {
  openai:     "OpenAI",
  anthropic:  "Claude",
  gemini:     "Gemini",
  ollama:     "Ollama",
  openrouter: "OpenRouter",
};

interface ProviderBadgeProps {
  provider: Provider;
}

export function ProviderBadge({ provider }: ProviderBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_COLORS[provider]}`}>
      {PROVIDER_LABELS[provider]}
    </span>
  );
}
