"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Counts = { new: number; queued: number; sending: number; sent: number; failed: number; replied: number };

export function LeadsMetrics({
  workspaceId, campaignId, from, to
}: { workspaceId: string; campaignId?: string | null; from?: string; to?: string }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [counts, setCounts] = useState<Counts>({ new:0, queued:0, sending:0, sent:0, failed:0, replied:0 });
  const [loading, setLoading] = useState(true);

  async function fetchCounts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (campaignId) params.set("campaign_id", campaignId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/leads/metrics?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setCounts(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCounts(); }, [workspaceId, campaignId, from, to]);

  useEffect(() => {
    const sub1 = supabase
      .channel("leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `workspace_id=eq.${workspaceId}` }, fetchCounts)
      .subscribe();
    const sub2 = supabase
      .channel("queue-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "send_queue" }, fetchCounts)
      .subscribe();
    return () => { supabase.removeChannel(sub1); supabase.removeChannel(sub2); };
  }, [supabase, workspaceId]);

  const items = [
    { key: "queued", label: "Queued" },
    { key: "sending", label: "Sending" },
    { key: "sent", label: "Sent" },
    { key: "failed", label: "Failed" },
    { key: "replied", label: "Replied" },
    { key: "new", label: "New" },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map(({ key, label }) => (
        <div key={key} className="p-3 rounded-md border bg-background">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{loading ? "—" : (counts as any)[key]}</div>
        </div>
      ))}
    </div>
  );
}


