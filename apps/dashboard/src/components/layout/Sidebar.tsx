"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, DollarSign, History, Settings, Zap, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/",          label: "Overview",  icon: LayoutDashboard },
  { href: "/providers", label: "Providers", icon: BarChart2 },
  { href: "/costs",     label: "Costs",     icon: DollarSign },
  { href: "/budgets",   label: "Budgets",   icon: Bell },
  { href: "/sessions",  label: "Sessions",  icon: History },
  { href: "/routing",   label: "Routing",   icon: Zap },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-[#1e1e2e] bg-[#0d0d14] p-4 gap-1">
      <div className="mb-6 px-2">
        <h1 className="text-lg font-bold text-indigo-400 tracking-tight">ObservaAI</h1>
        <p className="text-[11px] text-slate-500">AI Usage Monitor</p>
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
