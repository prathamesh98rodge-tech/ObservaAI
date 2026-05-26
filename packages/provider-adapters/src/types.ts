import type { NormalizedRequest, Provider } from "@observaai/shared-types";

export interface ProviderAdapter {
  provider: Provider;
  normalize(rawResponse: unknown, latencyMs: number, sessionId: string): NormalizedRequest;
  getProxyUrl(path: string): string;
}
