"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type QueueRow = {
  id: string;
  status: string;
  step_no: number;
  run_at: string;
};

export function QueueMonitor() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/queue");
      const data = await res.json();
      setRows((data?.rows ?? []) as QueueRow[]);
    } catch (error) {
      console.error("queue refresh error", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function tickOnce() {
    try {
      await fetch("/functions/v1/send-tick-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batch_per_account: 10 }),
      });
    } catch (error) {
      console.error("tick error", error);
    } finally {
      void load();
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border bg-muted/30 p-3">
      <div className="text-sm font-medium">Send Queue</div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
        <Button size="sm" variant="outline" onClick={tickOnce} disabled={loading}>
          Tick once
        </Button>
      </div>
      <div className="text-xs">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="flex justify-between border-b py-1 last:border-0">
              <div>
                {row.status} — step {row.step_no}
              </div>
              <div className="opacity-60">{new Date(row.run_at).toLocaleString()}</div>
            </div>
          ))
        ) : (
          <div className="text-muted-foreground">Queue is empty.</div>
        )}
      </div>
    </div>
  );
}





