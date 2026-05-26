"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Check, Wifi, WifiOff, Server } from "lucide-react";

const DEFAULT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8000";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";

type ConnectionStatus = "idle" | "checking" | "connected" | "offline";

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  details?: Record<string, unknown>;
}

// ── small helpers ─────────────────────────────────────────────────────────────

function formatGB(bytes: number): string {
  return (bytes / 1e9).toFixed(1) + " GB";
}

function StatusBadge({
  status,
  label,
}: {
  status: ConnectionStatus;
  label: string;
}) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <span className="text-emerald-400">●</span>
        {label}
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
        <span>✗</span>
        {label}
      </span>
    );
  }
  return null;
}

// ── password input ─────────────────────────────────────────────────────────────

function PasswordInput({
  id,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#1a1a2e] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ── copy button ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
    >
      {copied ? (
        <>
          <Check size={11} />
          Copied!
        </>
      ) : (
        <>
          <Copy size={11} />
          Copy
        </>
      )}
    </button>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Section A — Gateway
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [gatewayStatus, setGatewayStatus] = useState<ConnectionStatus>("idle");
  const [gatewayLabel, setGatewayLabel] = useState("");

  // Section B — API Keys (display only)
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");

  // Section C — Ollama
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [ollamaStatus, setOllamaStatus] = useState<ConnectionStatus>("idle");
  const [ollamaLabel, setOllamaLabel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);

  // ── handlers ──────────────────────────────────────────────────────────────

  async function testGateway() {
    setGatewayStatus("checking");
    setGatewayLabel("");
    try {
      const res = await fetch(`${gatewayUrl}/health`);
      if (res.ok) {
        setGatewayStatus("connected");
        setGatewayLabel("Connected — ObservaAI Gateway v0.1.0");
      } else {
        setGatewayStatus("offline");
        setGatewayLabel("Offline");
      }
    } catch {
      setGatewayStatus("offline");
      setGatewayLabel("Offline");
    }
  }

  async function testOllama() {
    setOllamaStatus("checking");
    setOllamaLabel("");
    setOllamaModels([]);
    try {
      const res = await fetch(`${gatewayUrl}/ollama/status`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      if (data.online) {
        setOllamaStatus("connected");
        setOllamaLabel(`Running — Ollama v${data.version ?? "unknown"}`);
        // fetch available models
        const modelsRes = await fetch(`${gatewayUrl}/ollama/models`);
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          setOllamaModels(modelsData.models ?? []);
        }
      } else {
        setOllamaStatus("offline");
        setOllamaLabel("Not running");
      }
    } catch {
      setOllamaStatus("offline");
      setOllamaLabel("Not running");
    }
  }

  // ── proxy URL table data ───────────────────────────────────────────────────

  const proxyProviders = [
    { label: "OpenAI", path: "openai" },
    { label: "Anthropic", path: "anthropic" },
    { label: "Gemini", path: "gemini" },
    { label: "Ollama", path: "ollama" },
    { label: "OpenRouter", path: "openrouter" },
  ];

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-8">
      {/* header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Configure gateway URL, API keys, and local model endpoints.
        </p>
      </div>

      {/* ── Section A: Gateway ─────────────────────────────────────────────── */}
      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Server size={16} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-100">Gateway</h3>
        </div>

        <div className="space-y-2">
          <label htmlFor="gateway-url" className="text-xs text-slate-400">
            Gateway URL
          </label>
          <input
            id="gateway-url"
            type="text"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            className="w-full bg-[#1a1a2e] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={testGateway}
            disabled={gatewayStatus === "checking"}
            className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {gatewayStatus === "checking" ? (
              "Checking…"
            ) : (
              <>
                <Wifi size={12} />
                Test Connection
              </>
            )}
          </button>

          {gatewayStatus !== "idle" && gatewayStatus !== "checking" && (
            <StatusBadge status={gatewayStatus} label={gatewayLabel} />
          )}
          {gatewayStatus === "offline" && (
            <span className="inline-flex items-center gap-1 text-xs text-red-400">
              <WifiOff size={12} />
            </span>
          )}
        </div>
      </section>

      {/* ── Section B: API Keys ────────────────────────────────────────────── */}
      <section className="card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">API Keys</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          API keys are configured in{" "}
          <code className="bg-[#1a1a2e] px-1.5 py-0.5 rounded text-slate-300 font-mono text-[11px]">
            apps/gateway/.env
          </code>
          . Edit that file to update keys.
        </p>

        <div className="space-y-4">
          {[
            {
              id: "openai-key",
              label: "OpenAI API Key",
              placeholder: "sk-...",
              value: openaiKey,
              onChange: setOpenaiKey,
            },
            {
              id: "anthropic-key",
              label: "Anthropic API Key",
              placeholder: "sk-ant-...",
              value: anthropicKey,
              onChange: setAnthropicKey,
            },
            {
              id: "gemini-key",
              label: "Gemini API Key",
              placeholder: "AIza...",
              value: geminiKey,
              onChange: setGeminiKey,
            },
            {
              id: "openrouter-key",
              label: "OpenRouter API Key",
              placeholder: "sk-or-...",
              value: openrouterKey,
              onChange: setOpenrouterKey,
            },
          ].map(({ id, label, placeholder, value, onChange }) => (
            <div key={id} className="space-y-1.5">
              <label htmlFor={id} className="text-xs text-slate-400">
                {label}
              </label>
              <PasswordInput
                id={id}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
              />
              <p className="text-[11px] text-slate-600">
                Stored in .env file — not sent to any server.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section C: Local Models (Ollama) ───────────────────────────────── */}
      <section className="card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">
          Local Models (Ollama)
        </h3>

        <div className="space-y-2">
          <label htmlFor="ollama-url" className="text-xs text-slate-400">
            Ollama URL
          </label>
          <input
            id="ollama-url"
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            className="w-full bg-[#1a1a2e] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={testOllama}
            disabled={ollamaStatus === "checking"}
            className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {ollamaStatus === "checking" ? "Checking…" : "Test Ollama"}
          </button>

          {ollamaStatus !== "idle" && ollamaStatus !== "checking" && (
            <StatusBadge status={ollamaStatus} label={ollamaLabel} />
          )}
        </div>

        {ollamaStatus === "connected" && ollamaModels.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-500 mb-2">Available models</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-[#1e1e2e]">
                  <th className="pb-1.5 font-medium">Name</th>
                  <th className="pb-1.5 font-medium text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {ollamaModels.map((m) => (
                  <tr
                    key={m.name}
                    className="border-b border-[#1e1e2e] last:border-0"
                  >
                    <td className="py-1.5 text-slate-300 font-mono">{m.name}</td>
                    <td className="py-1.5 text-slate-400 text-right">
                      {formatGB(m.size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ollamaStatus === "connected" && ollamaModels.length === 0 && (
          <p className="text-xs text-slate-500">No models found locally.</p>
        )}
      </section>

      {/* ── Section D: Proxy URLs ──────────────────────────────────────────── */}
      <section className="card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">Proxy URLs</h3>
        <p className="text-xs text-slate-500">
          Point your SDK base URL to one of these to route traffic through the
          gateway.
        </p>

        <div className="space-y-2">
          {proxyProviders.map(({ label, path }) => {
            const url = `${gatewayUrl}/proxy/${path}`;
            return (
              <div
                key={path}
                className="flex items-center justify-between gap-3 py-2 border-b border-[#1e1e2e] last:border-0"
              >
                <span className="text-xs text-slate-400 w-24 shrink-0">
                  {label}
                </span>
                <code className="text-xs text-slate-300 font-mono flex-1 truncate">
                  {url}
                </code>
                <CopyButton text={url} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
