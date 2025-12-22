"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type EligibleRow = {
  thread_id: string;
  campaign_id: string;
  lead_id: string;
  lead_name: string | null;
  lead_company: string | null;
  lead_email: string | null;
  last_inbound_label: string | null;
  last_inbound_at: string | null;
  nudges_already: number;
  max_nudges: number;
  hours_wait: number;
  since_inbound: string;
};

export default function FollowupsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [rows, setRows] = React.useState<EligibleRow[]>([]);
  const [loadingIds, setLoadingIds] = React.useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function refresh() {
    if (!campaignId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/followups/eligible`);
      const json = await res.json();
      setRows(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      console.error("Failed to load followups", err);
    } finally {
      setRefreshing(false);
    }
  }

  async function createFollowup(threadId: string) {
    setLoadingIds((prev) => new Set([...prev, threadId]));
    try {
      await fetch(`/api/thread/${threadId}/followups/create`, { method: "POST" });
      await refresh();
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    }
  }

  async function runGenerator() {
    await fetch("/api/followups/run", { method: "POST" });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xl font-semibold">Follow-Ups</div>
          <div className="text-sm text-muted-foreground">
            Threads that need a gentle nudge based on reply labels and wait windows.
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={runGenerator}>
            Run generator
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-12 gap-2 border-b bg-muted/40 p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div className="col-span-5">Lead / Thread</div>
          <div className="col-span-2">Last inbound</div>
          <div className="col-span-2">Label</div>
          <div className="col-span-1 text-center">Nudges</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No threads need a follow-up right now. 🎯
          </div>
        ) : (
          rows.map((row) => {
            const isLoading = loadingIds.has(row.thread_id);
            return (
              <div
                key={row.thread_id}
                className="grid grid-cols-12 items-center gap-2 border-b p-3 last:border-b-0"
              >
                <div className="col-span-5">
                  <div className="font-medium">
                    <Link href={`/campaign/${row.campaign_id}/inbox/${row.thread_id}`}>
                      {row.lead_name || row.lead_email || `Lead ${row.lead_id.slice(0, 8)}…`}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.lead_company || row.lead_email}
                  </div>
                </div>

                <div className="col-span-2 text-sm">
                  {row.last_inbound_at
                    ? new Date(row.last_inbound_at).toLocaleString()
                    : "—"}
                </div>

                <div className="col-span-2">
                  {row.last_inbound_label ? (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      {row.last_inbound_label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>

                <div className="col-span-1 text-center text-sm">
                  {row.nudges_already}/{row.max_nudges}
                </div>

                <div className="col-span-2 flex justify-end">
                  <Button
                    size="sm"
                    disabled={isLoading}
                    onClick={() => createFollowup(row.thread_id)}
                  >
                    {isLoading ? "Creating…" : "Create follow-up"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}



