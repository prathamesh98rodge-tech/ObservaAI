export type Provider = "openai" | "anthropic" | "gemini" | "ollama" | "openrouter";

export type ModelTier = "fast" | "balanced" | "powerful";

export interface NormalizedRequest {
  id: string;
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  latencyMs: number;
  costEstimate: number;
  projectId?: string;
  sessionId: string;
  createdAt: string;
  streaming: boolean;
  temperature?: number;
  topP?: number;
}

export interface Session {
  id: string;
  userId?: string;
  workspaceName: string;
  startTime: string;
  endTime?: string;
  totalTokens: number;
  totalCost: number;
  requests: NormalizedRequest[];
}

export interface ProviderPricing {
  provider: Provider;
  model: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedInputPricePer1M?: number;
}

export interface TokenUsageSummary {
  provider: Provider;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
  avgLatencyMs: number;
}

export interface LiveMetrics {
  activeProvider?: Provider;
  activeModel?: string;
  sessionTokens: number;
  sessionCost: number;
  avgLatencyMs: number;
  requestsInFlight: number;
  usageByProvider: TokenUsageSummary[];
}

export interface IDETelemetry {
  workspaceName: string;
  repoName?: string;
  activeFile?: string;
  language?: string;
  aiEditPercentage?: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
}

export interface GatewayConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openrouterApiKey?: string;
  ollamaBaseUrl?: string;
  gatewayUrl: string;
}

export interface AnalyticsQuery {
  startTime?: string;
  endTime?: string;
  provider?: Provider;
  model?: string;
  granularity?: "hour" | "day" | "month";
}

export interface CostBreakdown {
  period: string;
  provider: Provider;
  model: string;
  cost: number;
  tokens: number;
}
