"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type QueueRow = {
  id: string;
  lead_email: string;
  campaign_name?: string;
  status: string;
  attempt: number;
  max_attempts: number;
  scheduled_at: string | null;
  last_error?: string | null;
  meta?: {
    blocked_reason?: string;
    suppression_reason?: string;
  } | null;
};

export default function QueueTable({ rows }: { rows: QueueRow[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const router = useRouter();

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const selectedIds = useMemo(
    () => allIds.filter((id) => selected[id]),
    [allIds, selected]
  );

  const allChecked = selectedIds.length === rows.length && rows.length > 0;
  const someChecked = selectedIds.length > 0 && !allChecked;

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) rows.forEach((r) => (next[r.id] = true));
    setSelected(next);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [id]: checked }));
  }

  async function onRetrySelected() {
    if (selectedIds.length === 0) return;

    const resp = await fetch("/api/queue/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_ids: selectedIds }),
    });

    if (resp.ok) {
      const res = await resp.json();
      const retried = res.retried?.length || 0;
      const blocked = res.blocked?.length || 0;
      toast.success(`Re-queued ${retried} • Blocked ${blocked}`);
      setSelected({});
      router.refresh();
    } else {
      const err = await resp.json().catch(() => ({}));
      toast.error(err?.error || "Retry failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {selectedIds.length > 0
            ? `${selectedIds.length} selected`
            : `${rows.length} items`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="rounded-2xl"
            onClick={onRetrySelected}
            disabled={selectedIds.length === 0}
            title={
              selectedIds.length === 0
                ? "Select failed rows to retry"
                : "Retry selected failed items"
            }
          >
            Retry Selected
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                  indeterminate={someChecked}
                />
              </th>
              <th className="p-3 text-left">Lead</th>
              <th className="p-3 text-left">Campaign</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Attempt</th>
              <th className="p-3 text-left">Scheduled</th>
              <th className="p-3 text-left">Last Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const canRetry = r.status === "failed" && r.attempt < r.max_attempts;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <Checkbox
                      checked={!!selected[r.id]}
                      onCheckedChange={(v) => toggleOne(r.id, Boolean(v))}
                    />
                  </td>
                  <td className="p-3">{r.lead_email}</td>
                  <td className="p-3">{r.campaign_name || "-"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === "failed" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                      {r.meta?.blocked_reason === "suppression" && (
                        <>
                          <Badge variant="outline" className="text-xs">
                            suppressed
                          </Badge>
                          {r.meta?.suppression_reason && (
                            <span className="text-[10px] opacity-60">
                              {r.meta.suppression_reason}
                            </span>
                          )}
                        </>
                      )}
                      {r.status === "canceled" && r.last_error?.includes("duplicate") && (
                        <Badge variant="outline" className="text-xs" title="Auto-canceled duplicate: this step was already sent within the last 24 hours">
                          duplicate
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {r.attempt}/{r.max_attempts}{" "}
                    {!canRetry && r.status === "failed" && (
                      <span className="text-xs opacity-60">(max)</span>
                    )}
                  </td>
                  <td className="p-3">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}</td>
                  <td className="p-3 max-w-[320px] truncate" title={r.last_error || ""}>
                    {r.last_error || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-60">
        Tip: Retry only affects <strong>failed</strong> items with <strong>attempt &lt; max_attempts</strong>.
      </div>
    </div>
  );
}


