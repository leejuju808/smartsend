"use client";

import { useEffect, useMemo, useState } from "react";

type Readiness = {
  ready: boolean;
  checks: Record<string, { ok: boolean; message?: string }>;
};

const BUG_SWEEP_ITEMS = [
  { key: "send_failures", label: "Send failures" },
  { key: "duplicate_prevention", label: "Duplicate prevention" },
  { key: "followup_timing", label: "Follow-up timing" },
  { key: "paywall_triggers", label: "Paywall triggers" },
  { key: "dashboard_math", label: "Dashboard math" },
] as const;

function storageKey() {
  return "smartsend:bug_sweep_mode:v1";
}

export function SalesOpsPanel() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load bug sweep checkboxes (local-only)
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(checked));
    } catch {
      // ignore
    }
  }, [checked]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/sales-readiness", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Readiness;
        if (alive) setReadiness(json);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const allBugSweepDone = useMemo(() => {
    return BUG_SWEEP_ITEMS.every((i) => checked[i.key]);
  }, [checked]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Sales Readiness Check</div>
            <div className="text-xs text-gray-500 mt-1">
              Badge shows only when payments, email, approvals, and dashboard are healthy.
            </div>
          </div>
          {readiness?.ready ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              READY TO SELL
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              Not ready
            </span>
          )}
        </div>

        {readiness?.checks ? (
          <div className="mt-4 grid gap-2">
            {Object.entries(readiness.checks).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="text-sm font-medium text-gray-900">{k.replaceAll("_", " ")}</div>
                <div className="flex items-center gap-2">
                  <span className={v.ok ? "text-green-700" : "text-red-700"}>{v.ok ? "OK" : "FAIL"}</span>
                  {v.message ? <span className="text-xs text-gray-500">{v.message}</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-sm text-gray-500">Readiness details available to admins only.</div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Bug Sweep Mode</div>
            <div className="text-xs text-gray-500 mt-1">Only bugs/reliability now.</div>
          </div>
          {allBugSweepDone ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              Clean sweep
            </span>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          {BUG_SWEEP_ITEMS.map((item) => (
            <label key={item.key} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <input
                type="checkbox"
                checked={!!checked[item.key]}
                onChange={(e) => setChecked((s) => ({ ...s, [item.key]: e.target.checked }))}
              />
              <span className="text-sm text-gray-900">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}









