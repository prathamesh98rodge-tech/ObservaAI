import type { ProviderPricing } from "@observaai/shared-types";

export const PRICING_TABLE: ProviderPricing[] = [
  { provider: "anthropic", model: "claude-opus-4-7",        inputPricePer1M: 15,   outputPricePer1M: 75   },
  { provider: "anthropic", model: "claude-sonnet-4-6",      inputPricePer1M: 3,    outputPricePer1M: 15   },
  { provider: "anthropic", model: "claude-haiku-4-5",       inputPricePer1M: 0.8,  outputPricePer1M: 4    },
  { provider: "openai",    model: "gpt-4o",                 inputPricePer1M: 2.5,  outputPricePer1M: 10   },
  { provider: "openai",    model: "gpt-4o-mini",            inputPricePer1M: 0.15, outputPricePer1M: 0.6  },
  { provider: "openai",    model: "o3",                     inputPricePer1M: 10,   outputPricePer1M: 40   },
  { provider: "gemini",    model: "gemini-2.5-pro",         inputPricePer1M: 1.25, outputPricePer1M: 10   },
  { provider: "gemini",    model: "gemini-2.5-flash",       inputPricePer1M: 0.075,outputPricePer1M: 0.3  },
  { provider: "ollama",    model: "local",                  inputPricePer1M: 0,    outputPricePer1M: 0    },
  { provider: "openrouter",model: "openrouter/auto",        inputPricePer1M: 0,    outputPricePer1M: 0    },
];

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING_TABLE.find(
    (p) => p.provider === provider && (p.model === model || model.includes(p.model))
  );
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPricePer1M +
    (outputTokens / 1_000_000) * pricing.outputPricePer1M
  );
}
