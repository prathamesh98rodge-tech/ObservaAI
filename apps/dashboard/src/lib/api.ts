const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8000";


export async function fetchLiveMetrics(teamId?: string | null) {
  const res = await fetch(`${GATEWAY_URL}/analytics/live?${teamId ? `team_id=${encodeURIComponent(teamId)}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch live metrics");
  return res.json();
}

export async function fetchTokenUsage(provider?: string, teamId?: string | null) {
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/tokens?${params}`);
  if (!res.ok) throw new Error("Failed to fetch token usage");
  return res.json();
}

export async function fetchCosts(teamId?: string | null) {
  const res = await fetch(`${GATEWAY_URL}/analytics/costs?${teamId ? `team_id=${encodeURIComponent(teamId)}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch costs");
  return res.json();
}

export async function fetchSessions(teamId?: string | null) {
  const res = await fetch(`${GATEWAY_URL}/analytics/sessions?${teamId ? `team_id=${encodeURIComponent(teamId)}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function fetchRequests(sessionId?: string, teamId?: string | null, source?: string) {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (teamId) params.set("team_id", teamId);
  if (source && source !== "all") params.set("source", source);
  const res = await fetch(`${GATEWAY_URL}/analytics/requests?${params}`);
  if (!res.ok) throw new Error("Failed to fetch requests");
  return res.json();
}

export interface CliActivity {
  detected: string[];
  tokensToday: number;
  lastSeenAt: string | null;
}

export async function fetchTimeline(granularity: "minute" | "hour" | "day" = "hour", teamId?: string | null) {
  const params = new URLSearchParams({ granularity });
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/timeline?${params}`);
  if (!res.ok) throw new Error("Failed to fetch timeline");
  return res.json();
}

export async function fetchCacheMetrics(teamId?: string | null) {
  const res = await fetch(`${GATEWAY_URL}/analytics/cache?${teamId ? `team_id=${encodeURIComponent(teamId)}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch cache metrics");
  return res.json();
}

export async function fetchRateLimits(teamId?: string | null) {
  const params = new URLSearchParams();
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/rate-limits?${params}`);
  if (!res.ok) throw new Error("Failed to fetch rate limits");
  return res.json();
}

export async function fetchErrors(teamId?: string | null) {
  const params = new URLSearchParams();
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/errors?${params}`);
  if (!res.ok) throw new Error("Failed to fetch error rates");
  return res.json();
}

// ── forecast + anomaly API ────────────────────────────────────────────────────

export interface ForecastData {
  daily_avg: number;
  weekly_projection: number;
  monthly_projection: number;
  trend: "up" | "down" | "stable" | "new" | "no_data";
  trend_pct: number;
  days_sampled: number;
}

export interface AnomalyEntry {
  request_id: string;
  provider: string;
  model: string;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  type: "cost_spike" | "token_spike";
  value: number;
  expected: number;
  z_score: number;
}

export async function fetchForecast(teamId?: string | null): Promise<ForecastData> {
  const params = new URLSearchParams();
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/forecast?${params}`);
  if (!res.ok) throw new Error("Failed to fetch forecast");
  return res.json();
}

export async function fetchAnomalies(
  teamId?: string | null
): Promise<{ anomalies: AnomalyEntry[]; baseline_n: number; cost_mean: number; cost_std: number }> {
  const params = new URLSearchParams();
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/anomalies?${params}`);
  if (!res.ok) throw new Error("Failed to fetch anomalies");
  return res.json();
}

// ── budget API ────────────────────────────────────────────────────────────────

export interface BudgetCreate {
  label?: string;
  workspace_name?: string;
  provider?: string;
  period?: "day" | "week" | "month";
  limit_usd: number;
  alert_pct?: number;
  webhook_url?: string;
}

export async function fetchBudgets() {
  const res = await fetch(`${GATEWAY_URL}/budgets`);
  if (!res.ok) throw new Error("Failed to fetch budgets");
  return res.json();
}

export async function createBudget(body: BudgetCreate) {
  const res = await fetch(`${GATEWAY_URL}/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create budget");
  return res.json();
}

export async function updateBudget(id: string, body: Partial<BudgetCreate & { enabled: boolean }>) {
  const res = await fetch(`${GATEWAY_URL}/budgets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update budget");
  return res.json();
}

export async function deleteBudget(id: string) {
  const res = await fetch(`${GATEWAY_URL}/budgets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete budget");
}

export const GATEWAY_WS_URL = GATEWAY_URL.replace(/^http/, "ws") + "/ws/metrics";

// ── subscriptions API ─────────────────────────────────────────────────────────

export interface SubscriptionCapacity {
  id: string;
  provider: string;
  plan: string;
  hourly_limit: number;
  daily_limit: number;
  weekly_limit: number;
  hourly_used: number;
  daily_used: number;
  weekly_used: number;
  hourly_pct: number | null;
  daily_pct: number | null;
  weekly_pct: number | null;
  estimated_cost_usd: number;
  recorded_at: string;
}

export async function fetchSubscriptions(): Promise<SubscriptionCapacity[]> {
  const res = await fetch(`${GATEWAY_URL}/subscriptions`);
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  const data = await res.json();
  return data.subscriptions ?? [];
}

export async function ingestSubscription(body: {
  provider: string;
  plan?: string;
  hourly_limit?: number;
  daily_limit?: number;
  weekly_limit?: number;
  hourly_used?: number;
  daily_used?: number;
  weekly_used?: number;
}): Promise<SubscriptionCapacity> {
  const res = await fetch(`${GATEWAY_URL}/subscriptions/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to ingest subscription usage");
  return res.json();
}

export async function fetchRecommendation(): Promise<{
  recommended: string | null;
  reason: string;
  snapshot: SubscriptionCapacity | null;
}> {
  const res = await fetch(`${GATEWAY_URL}/subscriptions/recommend`);
  if (!res.ok) throw new Error("Failed to fetch recommendation");
  return res.json();
}

// ── teams API ─────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface TeamApiKey {
  id: string;
  team_id: string;
  label: string;
  api_key: string;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch(`${GATEWAY_URL}/teams`);
  if (!res.ok) throw new Error("Failed to fetch teams");
  return res.json();
}

export async function createTeam(name: string): Promise<Team> {
  const res = await fetch(`${GATEWAY_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create team");
  return res.json();
}

export async function updateTeam(id: string, name: string): Promise<Team> {
  const res = await fetch(`${GATEWAY_URL}/teams/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to update team");
  return res.json();
}

export async function deleteTeam(id: string): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}/teams/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete team");
}

export async function fetchTeamKeys(teamId: string): Promise<TeamApiKey[]> {
  const res = await fetch(`${GATEWAY_URL}/teams/${teamId}/keys`);
  if (!res.ok) throw new Error("Failed to fetch team keys");
  return res.json();
}

export async function createTeamKey(teamId: string, label?: string): Promise<TeamApiKey> {
  const res = await fetch(`${GATEWAY_URL}/teams/${teamId}/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: label ?? "" }),
  });
  if (!res.ok) throw new Error("Failed to create team key");
  return res.json();
}

export async function deleteTeamKey(teamId: string, keyId: string): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}/teams/${teamId}/keys/${keyId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete team key");
}
