"use client";

import { useEffect, useMemo, useState } from "react";

type BugRow = {
  id: string;
  company_id: string | null;
  source: string;
  severity: "critical" | "high";
  area: "sending" | "followups" | "payments" | "dashboard" | "onboarding";
  description: string;
  status: "open" | "in_progress" | "fixed" | "verified";
  created_at: string;
  fixed_at: string | null;
};

type Gate = {
  ok: boolean;
  counts: { critical: number; high: number };
  flows: {
    send: { verified: boolean; ok: boolean; at: string | null; reason: string | null };
    payment: { verified: boolean; ok: boolean; at: string | null; reason: string | null };
  };
};

function pillClass(kind: "critical" | "high" | "ok" | "warn") {
  if (kind === "critical") return "bg-rose-50 text-rose-700 border-rose-200";
  if (kind === "high") return "bg-amber-50 text-amber-800 border-amber-200";
  if (kind === "warn") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function riskFrom(counts: { critical: number; high: number }): "LOW" | "MED" | "HIGH" {
  if (counts.critical > 0) return "HIGH";
  if (counts.high > 3) return "HIGH";
  if (counts.high > 0) return "MED";
  return "LOW";
}

export default function BugBashClient() {
  const [severity, setSeverity] = useState<"critical" | "high" | "all">("critical");
  const [area, setArea] = useState<
    "all" | "sending" | "followups" | "payments" | "dashboard" | "onboarding"
  >("all");
  const [status, setStatus] = useState<"active" | "open" | "in_progress" | "fixed" | "verified" | "all">(
    "active",
  );

  const [rows, setRows] = useState<BugRow[]>([]);
  const [gate, setGate] = useState<Gate | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const revenueRisk = useMemo(() => (gate ? riskFrom(gate.counts) : "LOW"), [gate]);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("severity", severity);
      qs.set("status", status);
      qs.set("area", area);
      const [bugsRes, gateRes] = await Promise.all([
        fetch(`/api/admin/bug-reports?${qs.toString()}`),
        fetch(`/api/admin/release-gate`),
      ]);
      const bugsJson = await bugsRes.json();
      const gateJson = await gateRes.json();
      if (!bugsRes.ok) throw new Error(bugsJson?.error || "Failed to load bug reports");
      if (!gateRes.ok) throw new Error(gateJson?.error || "Failed to load release gate");
      setRows(bugsJson.rows || []);
      setGate(gateJson);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, area, status]);

  async function setBugStatus(id: string, nextStatus: BugRow["status"]) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/bug-reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Update failed");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function verifyFlow(flow: "send" | "payment") {
    setErr(null);
    try {
      const res = await fetch("/api/admin/release-gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Flow check failed");
      setGate(j.gate);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Revenue Bug Bash (v1)</h1>
          <p className="text-sm text-slate-600 mt-1">Internal-only. Critical + High only.</p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${
              revenueRisk === "HIGH" ? pillClass("critical") : revenueRisk === "MED" ? pillClass("high") : pillClass("ok")
            }`}
            title="Computed from open critical/high bug reports"
          >
            Revenue Risk: {revenueRisk}
          </span>
          <button
            onClick={loadAll}
            className="px-3 py-2 rounded-md border bg-white text-sm hover:bg-slate-50"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm">{err}</div>
      ) : null}

      {/* Release Gate */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">Release Gate</div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${gate?.ok ? pillClass("ok") : pillClass("warn")}`}
          >
            {gate?.ok ? "PASS" : "BLOCKED"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Metric title="Critical (open)" value={String(gate?.counts.critical ?? 0)} tone={(gate?.counts.critical ?? 0) > 0 ? "critical" : "ok"} />
          <Metric title="High (open)" value={String(gate?.counts.high ?? 0)} tone={(gate?.counts.high ?? 0) > 3 ? "high" : "ok"} />
          <FlowMetric title="Send flow" flow={gate?.flows.send} onVerify={() => verifyFlow("send")} />
          <FlowMetric title="Payment flow" flow={gate?.flows.payment} onVerify={() => verifyFlow("payment")} />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">Severity</label>
          <select
            className="border rounded-md px-2 py-2 text-sm bg-white"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as any)}
          >
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="all">all</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">Area</label>
          <select className="border rounded-md px-2 py-2 text-sm bg-white" value={area} onChange={(e) => setArea(e.target.value as any)}>
            <option value="all">all</option>
            <option value="sending">sending</option>
            <option value="followups">followups</option>
            <option value="payments">payments</option>
            <option value="dashboard">dashboard</option>
            <option value="onboarding">onboarding</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-600">Status</label>
          <select className="border rounded-md px-2 py-2 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">active</option>
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="fixed">fixed</option>
            <option value="verified">verified</option>
            <option value="all">all</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white p-4">
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Severity</th>
                <th className="px-3 py-2 text-left">Area</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Fixed</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={7}>
                    {loading ? "Loading…" : "No bug reports."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${
                            r.severity === "critical" ? pillClass("critical") : pillClass("high")
                          }`}
                        >
                          {r.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.area}</td>
                      <td className="px-3 py-2">{r.status}</td>
                      <td className="px-3 py-2 max-w-xl">
                        <div className="truncate" title={r.description}>
                          {r.description}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {new Date(r.created_at).toISOString()}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.fixed_at ? new Date(r.fixed_at).toISOString() : "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {r.status !== "in_progress" && r.status !== "verified" ? (
                            <button
                              className="px-2 py-1 rounded border bg-white hover:bg-slate-50 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => setBugStatus(r.id, "in_progress")}
                            >
                              In progress
                            </button>
                          ) : null}

                          {r.status !== "fixed" && r.status !== "verified" ? (
                            <button
                              className="px-2 py-1 rounded border bg-white hover:bg-slate-50 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => setBugStatus(r.id, "fixed")}
                              title="Marks fixed + triggers auto-verification audit log"
                            >
                              Fixed
                            </button>
                          ) : null}

                          {r.status === "fixed" ? (
                            <button
                              className="px-2 py-1 rounded border bg-white hover:bg-slate-50 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => setBugStatus(r.id, "verified")}
                              title="Manual verify required"
                            >
                              Verify
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric(props: { title: string; value: string; tone: "ok" | "high" | "critical" }) {
  const cls = props.tone === "critical" ? pillClass("critical") : props.tone === "high" ? pillClass("high") : pillClass("ok");
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums">{props.value}</div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{props.tone === "ok" ? "ok" : "risk"}</span>
      </div>
    </div>
  );
}

function FlowMetric(props: {
  title: string;
  flow?: { verified: boolean; ok: boolean; at: string | null; reason: string | null };
  onVerify: () => void;
}) {
  const verified = !!props.flow?.verified;
  const cls = verified ? pillClass("ok") : pillClass("warn");
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${cls}`}>{verified ? "verified" : "not verified"}</span>
        <button className="px-2 py-1 rounded border bg-white hover:bg-slate-50 text-xs" onClick={props.onVerify}>
          Verify now
        </button>
      </div>
      <div className="mt-1 text-[11px] text-slate-500 truncate" title={props.flow?.reason ?? ""}>
        {props.flow?.at ? `Last: ${props.flow.at}` : "No checks yet"}
      </div>
    </div>
  );
}









