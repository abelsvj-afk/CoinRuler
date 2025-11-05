"use client";
import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "../lib/api";

const COMMANDS = [
  { key: "status", label: "/status", kind: "get", path: "/status" },
  { key: "approvals", label: "/approvals", kind: "get", path: "/approvals" },
  { key: "approve", label: "/approve <id>", kind: "patch", path: (id: string) => `/approvals/${id}`, body: (id: string) => ({ status: "approved", actedBy: "web-dashboard" }) },
  { key: "decline", label: "/decline <id>", kind: "patch", path: (id: string) => `/approvals/${id}`, body: (id: string) => ({ status: "declined", actedBy: "web-dashboard" }) },
  { key: "panic", label: "/panic", kind: "post", path: "/kill-switch", body: { enabled: true, reason: "Panic from web", setBy: "web-dashboard" } },
  { key: "resume", label: "/resume", kind: "post", path: "/kill-switch", body: { enabled: false, reason: "Resume from web", setBy: "web-dashboard" } },
  { key: "rotation-status", label: "/rotation-status", kind: "get", path: "/rotation/status" },
  { key: "rotation-check", label: "/rotation-check", kind: "post", path: "/rotation/scheduler/check" },
  { key: "rotate", label: "/rotate <service>", kind: "post", path: (svc: string) => `/rotation/rotate/${svc}` },
];

const ROTATE_SERVICES = ["coinbase", "discord", "mongodb", "openai"];

export default function CommandsPage() {
  const api = getApiBase();
  const [selected, setSelected] = useState(COMMANDS[0].key);
  const [arg, setArg] = useState("");
  const [svc, setSvc] = useState(ROTATE_SERVICES[0]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const cmd = useMemo(() => COMMANDS.find((c) => c.key === selected)!, [selected]);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const path = typeof cmd.path === "function" ? cmd.path(cmd.key === "rotate" ? svc : arg) : cmd.path;
      let res: Response;
      if (cmd.kind === "get") {
        res = await fetch(`${api}${path}`);
      } else if (cmd.kind === "post") {
        const body = typeof (cmd as any).body === "function" ? (cmd as any).body(arg) : (cmd as any).body;
        res = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      } else {
        // patch
        const body = (cmd as any).body(arg);
        res = await fetch(`${api}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setResult({ error: e.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Commands</h1>

      <div className="flex flex-col gap-3 border rounded p-4">
        <label className="text-sm">Select a command</label>
        <select className="border rounded p-2 text-gray-900" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {COMMANDS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        {selected === "approve" || selected === "decline" ? (
          <input className="border rounded p-2 text-gray-900" placeholder="Approval ID" value={arg} onChange={(e) => setArg(e.target.value)} />
        ) : null}

        {selected === "rotate" ? (
          <select className="border rounded p-2 text-gray-900" value={svc} onChange={(e) => setSvc(e.target.value)}>
            {ROTATE_SERVICES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        ) : null}

        <button className="px-3 py-2 rounded bg-blue-600 text-white w-fit" onClick={run} disabled={loading}>
          {loading ? "Running..." : "Run"}
        </button>
      </div>

      <div className="border rounded p-4 bg-gray-50 text-gray-900">
        <div className="text-sm font-medium mb-2">Result</div>
        <pre className="text-xs whitespace-pre-wrap">{result ? JSON.stringify(result, null, 2) : "No result yet"}</pre>
      </div>
    </main>
  );
}
