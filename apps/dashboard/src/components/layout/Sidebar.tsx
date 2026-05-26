"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, DollarSign, History, Settings, Zap, Bell, Users, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMetricsStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { fetchTeams, type Team } from "@/lib/api";

const NAV = [
  { href: "/",          label: "Overview",  icon: LayoutDashboard },
  { href: "/providers", label: "Providers", icon: BarChart2 },
  { href: "/costs",     label: "Costs",     icon: DollarSign },
  { href: "/budgets",   label: "Budgets",   icon: Bell },
  { href: "/sessions",  label: "Sessions",  icon: History },
  { href: "/teams",     label: "Teams",     icon: Users },
  { href: "/routing",   label: "Routing",   icon: Zap },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { selectedTeamId, setSelectedTeamId } = useMetricsStore();

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    refetchInterval: 30_000,
  });

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-[#1e1e2e] bg-[#0d0d14] p-4 gap-1">
      <div className="mb-4 px-2">
        <h1 className="text-lg font-bold text-indigo-400 tracking-tight">ObservaAI</h1>
        <p className="text-[11px] text-slate-500">AI Usage Monitor</p>
      </div>

      {/* Team switcher */}
      <div className="mb-3 relative">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider px-2 mb-1 block">Workspace</label>
        <div className="relative">
          <select
            value={selectedTeamId ?? ""}
            onChange={(e) => setSelectedTeamId(e.target.value || null)}
            className="w-full appearance-none bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-1.5 text-sm text-slate-300 pr-7 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All workspaces</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === href
              ? "bg-indigo-500/10 text-indigo-400 font-medium"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
          )}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}
    </aside>
  );
}
