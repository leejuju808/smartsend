"use client";
import React, { useState } from "react";

export default function RetryOneButton({
  queueId,
  disabled,
  onDone,
  scheduleInSeconds = 0, // e.g., 0 = now, 60 = in 1 min
}: {
  queueId: string;
  disabled?: boolean;
  onDone?: (newQueueId?: string) => void;
  scheduleInSeconds?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMsg(null);
    try {
      const when = new Date(Date.now() + scheduleInSeconds * 1000).toISOString();
      const res = await fetch("/api/queue/retry-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_id: queueId, scheduled_at: when }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Retry failed");
      setMsg("Re-queued");
      onDone?.(json.new_queue_id);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy || disabled}
        className="px-3 py-1.5 rounded-xl bg-black text-white text-sm disabled:opacity-50"
        title="Retry this failed send"
      >
        {busy ? "Retrying…" : "Retry"}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}