"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

type SelectedItem = {
  id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
};

export function SelectionToolbar({
  selected,
  onCleared,
  onRefetch,
}: {
  selected: SelectedItem[];
  onCleared: () => void;
  onRefetch: () => void;
}) {
  const count = selected.length;
  const anyAtMax = selected.some((r) => r.attempt_count >= r.max_attempts);
  const allRetryable =
    count > 0 && selected.every((r) => r.status === "failed" && r.attempt_count < r.max_attempts);
  const anyCancelable = selected.some((r) => r.status === "queued" || r.status === "sending");

  async function retrySelected() {
    try {
      const queueIds = selected
        .filter((r) => r.status === "failed" && r.attempt_count < r.max_attempts)
        .map((r) => r.id);

      if (queueIds.length === 0) {
        toast.error("No eligible failures to retry.");
        return;
      }

      const res = await fetch("/api/queue/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueIds }),
      });
      const json = await res.json();

      if (!res.ok || json.ok === false) {
        toast.error(json.message ?? "Retry failed");
        return;
      }

      const updated = (json.updatedIds?.length ?? 0) as number;
      const skipped = (json.skippedIds?.length ?? 0) as number;
      toast.success(`Re-queued ${updated}/${queueIds.length}` + (skipped ? ` — ${skipped} ineligible` : ""));
      onCleared();
      onRefetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Retry error");
    }
  }

  async function cancelSelected() {
    try {
      const queueIds = selected
        .filter((r) => r.status === "queued" || r.status === "sending")
        .map((r) => r.id);

      if (!queueIds.length) {
        toast.error("No queued/sending items to cancel.");
        return;
      }

      const res = await fetch("/api/queue/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueIds }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        toast.error(json.message ?? "Cancel failed");
        return;
      }
      const c = (json.canceledIds?.length ?? 0) as number;
      const s = (json.skippedIds?.length ?? 0) as number;
      const total = (json.canceledIds?.length ?? 0) + (json.skippedIds?.length ?? 0);
      toast.success(`Cancelled ${c}/${total}` + (s ? ` — ${s} ineligible` : ""));
      onCleared();
      onRefetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Cancel error");
    }
  }

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-4 my-2 flex items-center justify-between">
        <div className="text-sm">
          <b>{count}</b> selected
          {anyAtMax && <span className="ml-2 text-muted-foreground">(some at max attempts)</span>}
        </div>
        <div className="space-x-2">
          <Button
            variant="default"
            onClick={retrySelected}
            disabled={!allRetryable}
            title={!allRetryable ? "Only failed jobs under max attempts can be retried" : undefined}
          >
            Retry Failed
          </Button>
          <Button
            variant="secondary"
            className="text-red-600"
            onClick={cancelSelected}
            disabled={!anyCancelable}
            title={!anyCancelable ? "Select queued/sending to cancel" : undefined}
          >
            Cancel Selected
          </Button>
          <Button variant="secondary" onClick={onCleared}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}


