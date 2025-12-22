"use client";

import React, { useEffect, useMemo, useState } from "react";

type Counts = Record<
  | "queued"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "throttled"
  | "paused"
  | "bounced"
  | "replied",
  number
>;

type RecentItem = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  subject: string | null;
  scheduled_at: string | null;
  updated_at: string | null;
  last_error: string | null;
};

export default function QueueMonitor({ workspaceId }: { workspaceId?: string }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [hourSent, setHourSent] = useState(0);
  const [daySent, setDaySent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const qs = new URLSearchParams();
      if (workspaceId) qs.set("workspace_id", workspaceId);
      const res = await fetch(`/api/queue/metrics?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load queue metrics");
      setCounts(json.counts);
      setRecent(json.recent);
      setHourSent(json.throughput?.sent_last_hour ?? 0);
      setDaySent(json.throughput?.sent_last_day ?? 0);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [workspaceId]);

  const totalPending = useMemo(() => {
    if (!counts) return 0;
    return (counts.queued ?? 0) + (counts.scheduled ?? 0) + (counts.throttled ?? 0);
  }, [counts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Queue Monitor</h3>
        <button
          className="inline-flex items-center rounded-md border px-3 py-1 text-sm hover:bg-muted"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Pending" value={totalPending} />
        <Stat label="Sending" value={counts?.sending ?? 0} />
        <Stat label="Sent" value={counts?.sent ?? 0} />
        <Stat label="Failed" value={counts?.failed ?? 0} />
        <Stat label="Sent (1h)" value={hourSent} />
        <Stat label="Sent (24h)" value={daySent} />
      </div>

      <div className="border rounded-md overflow-hidden">
        <div className="px-3 py-2 bg-muted/50 text-xs uppercase tracking-wide">Recent Activity</div>
        <div className="divide-y">
          {loading && recent.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No recent items</div>
          ) : (
            recent.map((r) => (
              <div key={r.id} className="p-3 text-sm flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.subject || "(no subject)"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.status}
                    {r.last_error ? ` • ${r.last_error.slice(0, 120)}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}


