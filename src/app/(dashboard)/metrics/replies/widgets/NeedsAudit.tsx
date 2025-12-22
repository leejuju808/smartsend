"use client";

import { useState } from "react";

const OPTIONS = ["positive", "neutral", "question", "negative", "unsubscribe", "out_of_office", "unknown"] as const;

type NeedsAuditRow = {
  id: string;
  subject: string | null;
  ai_intent: string | null;
  ai_confidence: number | null;
  ai_classified_at: string | null;
  lead_id?: string | null;
};

export function NeedsAudit({ rows }: { rows: NeedsAuditRow[] }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Needs Audit (most recent, no human label)</div>
      </div>
      <div className="grid gap-2">
        {rows.map((row) => (
          <AuditRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function AuditRow({ row }: { row: NeedsAuditRow }) {
  const [saving, setSaving] = useState(false);

  async function setLabel(human_intent: string) {
    try {
      setSaving(true);
      await fetch("/api/replies/reclassify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: row.id, human_intent }),
      });
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <div>
        <div className="line-clamp-1 text-sm font-medium">{row.subject ?? "(no subject)"}</div>
        <div className="text-xs text-zinc-500">
          AI: {row.ai_intent ?? "unknown"} • conf {row.ai_confidence?.toFixed?.(2) ?? "—"} •{" "}
          {row.ai_classified_at ? new Date(row.ai_classified_at).toLocaleString() : "—"}
        </div>
      </div>
      <div className="flex gap-1">
        {OPTIONS.map((option) => (
          <button
            key={option}
            disabled={saving}
            onClick={() => setLabel(option)}
            className="rounded-full border px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-60 dark:hover:bg-zinc-900"
          >
            {option === "out_of_office" ? "OOO" : option}
          </button>
        ))}
      </div>
    </div>
  );
}

