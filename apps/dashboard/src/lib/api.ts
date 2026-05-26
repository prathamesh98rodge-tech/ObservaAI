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

export async function fetchRequests(sessionId?: string, teamId?: string | null) {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (teamId) params.set("team_id", teamId);
  const res = await fetch(`${GATEWAY_URL}/analytics/requests?${params}`);
  if (!res.ok) throw new Error("Failed to fetch requests");
  return res.json();
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
