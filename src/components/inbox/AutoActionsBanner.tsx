"use client";

import { useState } from "react";

interface AutoActionsBannerProps {
  threadId: string;
  lastAiLabel?: string | null;
  status?: string;
  stoppedByReply?: boolean;
  onActionComplete?: () => void;
}

export function AutoActionsBanner({ threadId, lastAiLabel, status, stoppedByReply, onActionComplete }: AutoActionsBannerProps) {
  const [loading, setLoading] = useState(false);

  // Show reply-paused banner if thread was stopped by reply
  if (stoppedByReply) {
    return (
      <div className="mb-3 text-xs rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
        Follow-ups paused — prospect replied. You can resume by re-launching a new sequence.
      </div>
    );
  }

  if (!lastAiLabel) return null;

  const label = lastAiLabel;
  let msg = "";
  if (label === "unsubscribe") msg = "Thread closed automatically — unsubscribe detected.";
  else if (label === "ooo") msg = "Thread snoozed 3 days — out-of-office reply.";
  else if (label === "positive") msg = "Thread assigned to owner — positive reply detected.";
  else return null;

  async function act(url: string) {
    setLoading(true);
    try {
      const r = await fetch(url, { method: "POST" });
      if (!r.ok) throw new Error("Action failed");
      onActionComplete?.();
    } catch (e) {
      alert("Action failed. Please try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-3 rounded-md border bg-muted px-3 py-2 text-sm flex items-center justify-between">
      <span>{msg}</span>
      <div className="flex gap-2">
        {["closed","snoozed"].includes(status || "") && (
          <button
            disabled={loading}
            onClick={() => act(`/api/inbox/thread/${threadId}/reopen`)}
            className="text-xs border rounded-md px-2 py-1 hover:bg-background"
          >
            Reopen
          </button>
        )}
        <button
          disabled={loading}
          onClick={() => act(`/api/inbox/thread/${threadId}/clear-label`)}
          className="text-xs border rounded-md px-2 py-1 hover:bg-background"
        >
          Clear Label
        </button>
      </div>
    </div>
  );
}

