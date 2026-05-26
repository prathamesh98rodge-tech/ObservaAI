"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Key, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import {
  fetchTeams,
  createTeam,
  deleteTeam,
  fetchTeamKeys,
  createTeamKey,
  deleteTeamKey,
  type Team,
  type TeamApiKey,
} from "@/lib/api";

export default function TeamsPage() {
  const qc = useQueryClient();
  const [newTeamName, setNewTeamName] = useState("");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: fetchTeams,
  });

  const createTeamMut = useMutation({
    mutationFn: (name: string) => createTeam(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setNewTeamName("");
    },
  });

  const deleteTeamMut = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });

  function copyKey(value: string) {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-semibold text-slate-100 mb-1">Teams</h2>
      <p className="text-sm text-slate-400 mb-6">
        Manage multi-workspace teams and API keys. Pass an API key via{" "}
        <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded text-xs">X-ObservaAI-Team-Key</code>{" "}
        header to scope telemetry to a team.
      </p>

      {/* Create team */}
      <form
        className="flex gap-2 mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (newTeamName.trim()) createTeamMut.mutate(newTeamName.trim());
        }}
      >
        <input
          className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          placeholder="New team name…"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newTeamName.trim() || createTeamMut.isPending}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-md transition-colors"
        >
          <Plus size={14} />
          Create
        </button>
      </form>

      {/* Team list */}
      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && teams.length === 0 && (
        <p className="text-slate-500 text-sm">No teams yet. Create one above.</p>
      )}

      <div className="flex flex-col gap-3">
        {teams.map((team) => (
          <TeamRow
            key={team.id}
            team={team}
            expanded={expandedTeam === team.id}
            onToggle={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
            onDelete={() => deleteTeamMut.mutate(team.id)}
            newKeyLabel={newKeyLabel[team.id] ?? ""}
            onNewKeyLabelChange={(v) => setNewKeyLabel((p) => ({ ...p, [team.id]: v }))}
            copied={copied}
            onCopy={copyKey}
          />
        ))}
      </div>
    </div>
  );
}

function TeamRow({
  team,
  expanded,
  onToggle,
  onDelete,
  newKeyLabel,
  onNewKeyLabelChange,
  copied,
  onCopy,
}: {
  team: Team;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  newKeyLabel: string;
  onNewKeyLabelChange: (v: string) => void;
  copied: string | null;
  onCopy: (v: string) => void;
}) {
  const qc = useQueryClient();

  const { data: keys = [] } = useQuery<TeamApiKey[]>({
    queryKey: ["team-keys", team.id],
    queryFn: () => fetchTeamKeys(team.id),
    enabled: expanded,
  });

  const createKeyMut = useMutation({
    mutationFn: (label: string) => createTeamKey(team.id, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-keys", team.id] });
      onNewKeyLabelChange("");
    },
  });

  const deleteKeyMut = useMutation({
    mutationFn: (keyId: string) => deleteTeamKey(team.id, keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-keys", team.id] }),
  });

  return (
    <div className="border border-[#2a2a3e] rounded-lg bg-[#0f0f1a]">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          className="flex items-center gap-2 text-slate-200 text-sm font-medium hover:text-white transition-colors"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {team.name}
        </button>
        <button
          onClick={onDelete}
          className="text-slate-500 hover:text-red-400 transition-colors p-1"
          title="Delete team"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#2a2a3e] px-4 py-3 space-y-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">API Keys</p>

          {keys.length === 0 && (
            <p className="text-slate-500 text-xs">No keys yet.</p>
          )}

          {keys.map((key) => (
            <div key={key.id} className="flex items-center gap-2 bg-[#1a1a2e] rounded px-3 py-2">
              <Key size={12} className="text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                {key.label && <p className="text-xs text-slate-300 mb-0.5">{key.label}</p>}
                <code className="text-[11px] text-slate-400 font-mono truncate block">{key.api_key}</code>
              </div>
              <button
                onClick={() => onCopy(key.api_key)}
                className="text-slate-500 hover:text-slate-200 transition-colors p-1 shrink-0"
                title="Copy key"
              >
                {copied === key.api_key ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
              <button
                onClick={() => deleteKeyMut.mutate(key.id)}
                className="text-slate-500 hover:text-red-400 transition-colors p-1 shrink-0"
                title="Revoke key"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createKeyMut.mutate(newKeyLabel);
            }}
          >
            <input
              className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              placeholder="Key label (optional)"
              value={newKeyLabel}
              onChange={(e) => onNewKeyLabelChange(e.target.value)}
            />
            <button
              type="submit"
              disabled={createKeyMut.isPending}
              className="flex items-center gap-1 bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs px-2 py-1.5 rounded transition-colors"
            >
              <Plus size={11} />
              Add key
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
