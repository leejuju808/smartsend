"use client";

import { useEffect, useState } from "react";

type LogRow = {
  id: string;
  event: string;
  created_at: string;
  meta?: {
    reason?: string;
    heuristic?: number;
    provider?: string;
    external_id?: string;
  };
};

export default function LeadActivity({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/leads/${leadId}/logs`);
        const j = await r.json();
        setRows(j.rows ?? []);
      } catch (error) {
        console.error("Failed to load logs:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [leadId]);

  if (loading) {
    return (
      <div className="text-xs space-y-2">
        <div className="rounded-md border p-2 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-3 bg-gray-100 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-gray-500 p-4 text-center">
        No activity logs yet
      </div>
    );
  }

  return (
    <div className="text-xs space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border p-2">
          <div className="font-medium">{r.event}</div>
          <div className="opacity-70">{new Date(r.created_at).toLocaleString()}</div>
          {r.meta?.reason && <div>Reason: {r.meta.reason}</div>}
        </div>
      ))}
    </div>
  );
}

