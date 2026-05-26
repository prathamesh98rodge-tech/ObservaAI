"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSessions, fetchRequests } from "@/lib/api";
import { formatCost, formatTokens, formatLatency, PROVIDER_COLORS } from "@/lib/utils";
import { ChevronDown, ChevronRight, History } from "lucide-react";

// API returns snake_case — define local types matching the actual JSON
interface ApiSession {
  id: string; workspace_name: string; start_time: string;
  end_time?: string; total_tokens: number; total_cost: number;
}
interface ApiRequest {
  id: string; provider: string; model: string; session_id: string;
  input_tokens: number; output_tokens: number; latency_ms: number;
  estimated_cost: number; streaming: boolean; created_at: string;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso?: string): string {
  try {
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const ms = end - start;
    if (ms < 0) return "—";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  } catch {
    return "—";
  }
}

export default function SessionsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<ApiSession[]>({
    queryKey: ["sessions"],
    queryFn: () => fetchSessions(),
    refetchInterval: 15_000,
  });

  const { data: requestsData, isLoading: requestsLoading } = useQuery<ApiRequest[]>({
    queryKey: ["requests"],
    queryFn: () => fetchRequests(),
    refetchInterval: 15_000,
  });

  const sessions: ApiSession[] = sessionsData ?? [];
  const allRequests: ApiRequest[] = requestsData ?? [];

  // Group requests by session
  const requestsBySession = new Map<string, ApiRequest[]>();
  for (const req of allRequests) {
    const list = requestsBySession.get(req.session_id) ?? [];
    list.push(req);
    requestsBySession.set(req.session_id, list);
  }

  const isLoading = sessionsLoading || requestsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Sessions</h2>
        <p className="text-sm text-slate-500 mt-1">Session history and per-request details</p>
      </div>

      {/* Sessions table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 h-16 animate-pulse bg-white/3" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
          <History size={36} />
          <p className="text-sm">No sessions yet — start using your AI tools to see history here.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-[#1e1e2e] text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            <span>Time</span>
            <span>Workspace</span>
            <span>Total Tokens</span>
            <span>Total Cost</span>
            <span>Duration</span>
            <span className="w-20 text-right">Requests</span>
          </div>

          {/* Session rows */}
          {sessions.map((session) => {
            const sessionRequests = requestsBySession.get(session.id) ?? [];
            const isExpanded = expandedId === session.id;

            return (
              <div key={session.id} className="border-b border-[#1e1e2e] last:border-0">
                {/* Session row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className="w-full grid grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 text-left hover:bg-white/2 transition-colors items-center"
                >
                  <span className="text-sm text-slate-400 font-mono">
                    {formatDateTime(session.start_time)}
                  </span>
                  <span className="text-sm text-slate-200 truncate">{session.workspace_name}</span>
                  <span className="text-sm font-mono text-blue-400">
                    {formatTokens(session.total_tokens)}
                  </span>
                  <span className="text-sm font-mono text-emerald-400">
                    {formatCost(session.total_cost)}
                  </span>
                  <span className="text-sm font-mono text-slate-400">
                    {formatDuration(session.start_time, session.end_time)}
                  </span>
                  <div className="flex items-center gap-2 w-20 justify-end">
                    <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-mono text-indigo-400">
                      {sessionRequests.length}
                    </span>
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-slate-500" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-500" />
                    )}
                  </div>
                </button>

                {/* Expanded requests */}
                {isExpanded && (
                  <div className="bg-[#0a0a0f] border-t border-[#1e1e2e]">
                    {sessionRequests.length === 0 ? (
                      <p className="px-8 py-4 text-xs text-slate-500">No requests for this session.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 px-8 py-2 text-[10px] uppercase tracking-wider text-slate-600 font-semibold border-b border-[#1e1e2e]">
                          <span>Provider / Model</span>
                          <span>Time</span>
                          <span>Input Tokens</span>
                          <span>Output Tokens</span>
                          <span>Latency</span>
                          <span>Cost</span>
                        </div>
                        {sessionRequests.map((req) => {
                          const color = PROVIDER_COLORS[req.provider] ?? "#64748b";
                          return (
                            <div
                              key={req.id}
                              className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_1fr] gap-4 px-8 py-3 text-sm border-b border-[#1e1e2e] last:border-0 hover:bg-white/1"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: color }}
                                />
                                <div className="min-w-0">
                                  <p className="capitalize text-slate-200 text-xs">{req.provider}</p>
                                  <p className="font-mono text-[10px] text-slate-500 truncate">{req.model}</p>
                                </div>
                              </div>
                              <span className="font-mono text-xs text-slate-400">
                                {formatDateTime(req.created_at)}
                              </span>
                              <span className="font-mono text-blue-400">
                                {formatTokens(req.input_tokens)}
                              </span>
                              <span className="font-mono text-green-400">
                                {formatTokens(req.output_tokens)}
                              </span>
                              <span className="font-mono text-yellow-400">
                                {formatLatency(req.latency_ms)}
                              </span>
                              <span className="font-mono text-emerald-400">
                                {formatCost(req.estimated_cost)}
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
