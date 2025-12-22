"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  selected: { id: string; attempt: number; max_attempts: number; status: string }[];
  refresh: () => void;
};

export default function SelectionToolbar({ selected, refresh }: Props) {
  const [loading, setLoading] = useState<"retry" | "cancel" | null>(null);

  const retryableIds = useMemo(
    () => selected.filter((r) => r.attempt < r.max_attempts).map((r) => r.id),
    [selected]
  );
  const cancellableIds = useMemo(
    () => selected.filter((r) => ["queued", "sending"].includes(r.status)).map((r) => r.id),
    [selected]
  );

  const doPost = async (path: string, ids: string[]) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const text = await res.text();
      let errorMsg = "Request failed";
      try {
        const json = JSON.parse(text);
        errorMsg = json.error || errorMsg;
      } catch {
        errorMsg = text || errorMsg;
      }
      throw new Error(errorMsg);
    }
    const json = await res.json();
    return json;
  };

  const onRetry = async () => {
    if (!retryableIds.length) return;
    setLoading("retry");
    try {
      const result = await doPost("/api/queue/retry", retryableIds);
      const skipped = selected.length - retryableIds.length;
      const message =
        skipped > 0
          ? `Re-queued ${retryableIds.length} item(s). ${skipped} skipped (attempt cap reached).`
          : `Re-queued ${retryableIds.length} item(s).`;
      toast.success(message);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to retry");
    } finally {
      setLoading(null);
    }
  };

  const onCancel = async () => {
    if (!cancellableIds.length) return;
    setLoading("cancel");
    try {
      const result = await doPost("/api/queue/cancel", cancellableIds);
      const skipped = selected.length - cancellableIds.length;
      const message =
        skipped > 0
          ? `Cancelled ${cancellableIds.length} item(s). ${skipped} skipped (not queued/sending).`
          : `Cancelled ${cancellableIds.length} item(s).`;
      toast.success(message);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setLoading(null);
    }
  };

  if (!selected.length) return null;

  const disabledRetry = retryableIds.length === 0;
  const disabledCancel = cancellableIds.length === 0;

  return (
    <div className="sticky top-0 z-10 mb-3 rounded-2xl border bg-background/80 backdrop-blur p-3 flex items-center gap-2">
      <div className="text-sm mr-auto">
        {selected.length} selected · Retry-ready: {retryableIds.length} · Cancellable:{" "}
        {cancellableIds.length}
      </div>
      <Button variant="secondary" onClick={onCancel} disabled={disabledCancel || !!loading}>
        {loading === "cancel" ? "Cancelling..." : "Cancel"}
      </Button>
      <Button onClick={onRetry} disabled={disabledRetry || !!loading}>
        {loading === "retry" ? "Re-queuing..." : "Retry"}
      </Button>
    </div>
  );
}

