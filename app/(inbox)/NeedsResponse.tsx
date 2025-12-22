"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type NeedsResponseRow = {
  thread_id: string;
  campaign_id: string;
  label: string | null;
  assigned_to: string | null;
  due_at: string;
  is_overdue: boolean;
};

type NeedsResponseProps = {
  campaignId?: string | null;
};

export function NeedsResponse({ campaignId }: NeedsResponseProps) {
  const [rows, setRows] = React.useState<NeedsResponseRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!campaignId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("campaignId", campaignId);
      const response = await fetch(
        `/api/inbox/needs-response${qs.toString() ? `?${qs.toString()}` : ""}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error("failed");
      }
      const data = (await response.json()) as NeedsResponseRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    if (!campaignId) {
      setRows([]);
      return;
    }
    load();
  }, [campaignId, load]);

  const handleClaim = React.useCallback(
    async (threadId: string) => {
      try {
        const response = await fetch(`/api/threads/${threadId}/claim`, { method: "POST" });
        if (!response.ok) {
          throw new Error("claim_failed");
        }
        toast.success("Thread claimed");
        await load();
      } catch {
        toast.error("Unable to claim thread");
      }
    },
    [load]
  );

  if (!campaignId) {
    return null;
  }

  return (
    <Card className="rounded-2xl border">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Needs Response</h3>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            All caught up for now.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.thread_id}
                className="flex items-center justify-between rounded-xl border px-3 py-2"
              >
                <div className="text-sm">
                  <div className="font-medium capitalize">{row.label ?? "untyped"}</div>
                  <div
                    className={`text-xs ${
                      row.is_overdue ? "text-red-600" : "text-slate-500"
                    }`}
                  >
                    Due {new Date(row.due_at).toLocaleString()}
                    {row.is_overdue ? " • OVERDUE" : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = `/inbox/thread/${row.thread_id}`;
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleClaim(row.thread_id)}
                  >
                    Claim
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}


