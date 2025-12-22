"use client";

import type { ReactNode } from "react";

type AuditSummaryProps = {
  audit: {
    audited?: number | null;
    accuracy?: number | null;
    avg_confidence?: number | null;
  };
};

export function AuditSummary({ audit }: AuditSummaryProps) {
  const acc = audit?.accuracy != null ? Math.round(audit.accuracy * 100) : null;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border p-4 md:grid-cols-3">
      <Card title="Audited threads (30d)" value={audit?.audited ?? 0} />
      <Card title="Accuracy on audited" value={acc != null ? `${acc}%` : "—"} />
      <Card title="Avg AI confidence" value={audit?.avg_confidence?.toFixed?.(2) ?? "—"} />
    </div>
  );
}

function Card({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

