import type {
  NormalizedRequest,
  Session,
  LiveMetrics,
  AnalyticsQuery,
  CostBreakdown,
  TokenUsageSummary,
} from "@observaai/shared-types";

export class ObservaAIClient {
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:8000") {
    this.baseUrl = baseUrl;
  }

  async getLiveMetrics(): Promise<LiveMetrics> {
    const res = await fetch(`${this.baseUrl}/analytics/live`);
    return res.json();
  }

  async getTokenUsage(query: AnalyticsQuery): Promise<TokenUsageSummary[]> {
    const params = new URLSearchParams(query as Record<string, string>);
    const res = await fetch(`${this.baseUrl}/analytics/tokens?${params}`);
    return res.json();
  }

  async getCosts(query: AnalyticsQuery): Promise<CostBreakdown[]> {
    const params = new URLSearchParams(query as Record<string, string>);
    const res = await fetch(`${this.baseUrl}/analytics/costs?${params}`);
    return res.json();
  }

  async getSessions(): Promise<Session[]> {
    const res = await fetch(`${this.baseUrl}/analytics/sessions`);
    return res.json();
  }

  async getRequests(sessionId?: string): Promise<NormalizedRequest[]> {
    const url = sessionId
      ? `${this.baseUrl}/analytics/requests?session_id=${sessionId}`
      : `${this.baseUrl}/analytics/requests`;
    const res = await fetch(url);
    return res.json();
  }

  connectWebSocket(onMessage: (metrics: LiveMetrics) => void): WebSocket {
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws/metrics";
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    return ws;
  }
}
