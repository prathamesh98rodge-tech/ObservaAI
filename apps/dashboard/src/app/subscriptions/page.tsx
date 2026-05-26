"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSubscriptions,
  fetchRecommendation,
  ingestSubscription,
  type SubscriptionCapacity,
} from "@/lib/api";
import React from "react";
import { PlusCircle, ArrowRightCircle } from "lucide-react";

function pctColor(pct: number | null): string {
  if (pct === null) return "text-slate-400";
  if (pct >= 80) return "text-red-400";
  if (pct >= 50) return "text-yellow-400";
  return "text-emerald-400";
}

function barColor(pct: number | null): string {
  if (pct === null) return "bg-slate-600";
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-emerald-500";
}

function CapacityBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number | null }) {
  if (limit <= 0) return null;
  const width = Math.min(pct ?? 0, 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400 uppercase tracking-wide text-[10px]">{label}</span>
        <span className={pctColor(pct)}>
          {used.toLocaleString()} / {limit.toLocaleString()} ({(pct ?? 0).toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1e1e2e] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor(pct)}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function ProviderCard({ sub }: { sub: SubscriptionCapacity }) {
  const COLORS: Record<string, string> = {
    claude: "#f97316",
    openai: "#10b981",
    gemini: "#3b82f6",
  };
  const color = COLORS[sub.provider] ?? "#64748b";

  return (
    <div className="rounded-xl bg-[#0d0d14] border border-[#1e1e2e] p-5" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm capitalize" style={{ color }}>{sub.provider}</h3>
          {sub.plan && <p className="text-xs text-slate-500 mt-0.5">{sub.plan}</p>}
        </div>
        <span className="text-[10px] text-slate-600">
          {new Date(sub.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <CapacityBar label="Hourly" used={sub.hourly_used} limit={sub.hourly_limit} pct={sub.hourly_pct} />
      <CapacityBar label="Daily" used={sub.daily_used} limit={sub.daily_limit} pct={sub.daily_pct} />
      <CapacityBar label="Weekly" used={sub.weekly_used} limit={sub.weekly_limit} pct={sub.weekly_pct} />
    </div>
  );
}

const PROVIDERS = ["claude", "openai", "gemini"];

const DEFAULT_FORM = {
  provider: "claude",
  plan: "",
  hourly_limit: 0,
  hourly_used: 0,
  daily_limit: 0,
  daily_used: 0,
  weekly_limit: 0,
  weekly_used: 0,
};

export default function SubscriptionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const { data: subs = [], isLoading } = useQuery<SubscriptionCapacity[]>({
    queryKey: ["subscriptions"],
    queryFn: fetchSubscriptions,
    refetchInterval: 60_000,
  });

  const { data: rec } = useQuery({
    queryKey: ["recommendation"],
    queryFn: fetchRecommendation,
    refetchInterval: 60_000,
  });

  const ingest = useMutation({
    mutationFn: ingestSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["recommendation"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
  });

  function num(v: string) { return parseInt(v, 10) || 0; }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Subscription Capacity</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track hourly / daily / weekly usage across Claude, ChatGPT and Gemini subscriptions.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <PlusCircle size={15} />
          Update Usage
        </button>
      </div>

      {rec?.recommended && (
        <div className="mb-6 flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3">
          <ArrowRightCircle size={18} className="text-indigo-400 shrink-0" />
          <div>
            <span className="text-sm font-medium text-indigo-300">
              Recommended next: <span className="capitalize">{rec.recommended}</span>
            </span>
            <p className="text-xs text-slate-400 mt-0.5">{rec.reason}</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Record usage snapshot</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Provider</label>
              <select
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                {PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Plan</label>
              <input
                value={form.plan}
                onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                placeholder="e.g. Pro, Plus"
                className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
              />
            </div>
            {(["hourly", "daily", "weekly"] as const).map(w => (
              <React.Fragment key={w}>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block capitalize">{w} used</label>
                  <input
                    type="number" min={0}
                    value={form[`${w}_used`]}
                    onChange={e => setForm(f => ({ ...f, [`${w}_used`]: num(e.target.value) }))}
                    className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block capitalize">{w} limit</label>
                  <input
                    type="number" min={0}
                    value={form[`${w}_limit`]}
                    onChange={e => setForm(f => ({ ...f, [`${w}_limit`]: num(e.target.value) }))}
                    className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => ingest.mutate(form)}
              disabled={ingest.isPending}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {ingest.isPending ? "Saving…" : "Save snapshot"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}

      {!isLoading && subs.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <p className="text-sm">No subscription data yet.</p>
          <p className="text-xs mt-1">Click &ldquo;Update Usage&rdquo; to record your first snapshot.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subs.map(s => <ProviderCard key={s.id} sub={s} />)}
      </div>
    </div>
  );
}
