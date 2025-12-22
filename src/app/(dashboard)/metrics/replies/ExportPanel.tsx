"use client";

import { useState } from "react";

export function ExportPanel({ campaignId }: { campaignId?: string }) {
  const [start, setStart] = useState<string>(new Date(Date.now() - 30 * 864e5).toISOString());
  const [end, setEnd] = useState<string>(new Date().toISOString());
  const [requireHuman, setRequireHuman] = useState(true);

  function dl(fmt: "jsonl" | "csv") {
    const u = new URL("/api/export/training", window.location.origin);
    u.searchParams.set("start", start);
    u.searchParams.set("end", end);
    u.searchParams.set("requireHuman", String(requireHuman));
    if (campaignId) u.searchParams.set("campaignId", campaignId);
    u.searchParams.set("format", fmt);
    window.location.href = u.toString();
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="text-sm font-semibold">Training Data Export</div>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-xs grid gap-1">
          <span>Start</span>
          <input className="rounded-lg border px-3 py-2 text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-xs grid gap-1">
          <span>End</span>
          <input className="rounded-lg border px-3 py-2 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="text-xs inline-flex items-center gap-2">
          <input type="checkbox" checked={requireHuman} onChange={(e) => setRequireHuman(e.target.checked)} />
          Require human labels
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={() => dl("jsonl")} className="rounded-xl border px-3 py-2 text-sm">
          Download JSONL
        </button>
        <button onClick={() => dl("csv")} className="rounded-xl border px-3 py-2 text-sm">
          Download CSV
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        PII is scrubbed on the database side. Use JSONL for fine-tuning or prompt calibration.
      </p>
    </div>
  );
}





