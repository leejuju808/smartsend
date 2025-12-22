"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  status: string;
  provider: string | null;
  account_id: string | null;
  subject: string | null;
  queued_at: string | null;
  next_attempt_at: string | null;
  fail_count: number | null;
  last_error: string | null;
  backoff_exp: number;
  last_status: string | null;
};
export default function QueuePage() {
  const { campaignId } = useParams() as { campaignId: string };
  const [rows, setRows] = React.useState<Row[]>([]);
  async function load() {
    const j = await fetch(`/api/campaign/${campaignId}/queue/list`).then((r) =>
      r.json()
    );
    setRows(j.items ?? []);
  }
  React.useEffect(() => {
    load();
  }, [campaignId]);

  async function retry(id: string) {
    await fetch(`/api/queue/${id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    load();
  }
  async function kill(id: string) {
    await fetch(`/api/queue/${id}/kill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    load();
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-xl font-semibold">Send Queue</div>
      <div className="rounded-2xl border divide-y">
        <div className="p-2 grid grid-cols-12 text-xs text-muted-foreground">
          <div className="col-span-3">Subject</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Next attempt</div>
          <div className="col-span-2">Fails</div>
          <div className="col-span-3">Actions</div>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="p-3 grid grid-cols-12 items-center gap-2">
            <div className="col-span-3 text-sm truncate">
              {r.subject ?? "—"}
            </div>
            <div className="col-span-2 text-sm">
              {r.status}
              {r.last_status ? ` • ${r.last_status}` : ""}
            </div>
            <div className="col-span-2 text-sm">
              {r.next_attempt_at
                ? new Date(r.next_attempt_at).toLocaleString()
                : "—"}
            </div>
            <div className="col-span-2 text-sm">
              {r.fail_count ?? 0} (2^{r.backoff_exp})
            </div>
            <div className="col-span-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => retry(r.id)}>
                Retry now
              </Button>
              <Button size="sm" variant="outline" onClick={() => kill(r.id)}>
                Kill
              </Button>
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="p-6 text-sm text-muted-foreground">
            Queue is clear.
          </div>
        )}
      </div>
    </div>
  );
}



