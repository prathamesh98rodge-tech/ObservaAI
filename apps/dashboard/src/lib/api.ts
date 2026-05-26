const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8000";

export async function fetchLiveMetrics() {
  const res = await fetch(`${GATEWAY_URL}/analytics/live`);
  if (!res.ok) throw new Error("Failed to fetch live metrics");
  return res.json();
}

export async function fetchTokenUsage(provider?: string) {
  const url = provider
    ? `${GATEWAY_URL}/analytics/tokens?provider=${provider}`
    : `${GATEWAY_URL}/analytics/tokens`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch token usage");
  return res.json();
}

export async function fetchCosts() {
  const res = await fetch(`${GATEWAY_URL}/analytics/costs`);
  if (!res.ok) throw new Error("Failed to fetch costs");
  return res.json();
}

export async function fetchSessions() {
  const res = await fetch(`${GATEWAY_URL}/analytics/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function fetchRequests(sessionId?: string) {
  const url = sessionId
    ? `${GATEWAY_URL}/analytics/requests?session_id=${sessionId}`
    : `${GATEWAY_URL}/analytics/requests`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch requests");
  return res.json();
}

export async function fetchTimeline(granularity: "minute" | "hour" | "day" = "hour") {
  const res = await fetch(`${GATEWAY_URL}/analytics/timeline?granularity=${granularity}`);
  if (!res.ok) throw new Error("Failed to fetch timeline");
  return res.json();
}

export async function fetchCacheMetrics() {
  const res = await fetch(`${GATEWAY_URL}/analytics/cache`);
  if (!res.ok) throw new Error("Failed to fetch cache metrics");
  return res.json();
}

export const GATEWAY_WS_URL = GATEWAY_URL.replace(/^http/, "ws") + "/ws/metrics";
