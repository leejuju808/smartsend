"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ReplyBar({ threadId, lastInboundId, initialNeedsReply, onMarked }: {
  threadId: string;
  lastInboundId?: string | null;
  initialNeedsReply?: boolean | null;
  onMarked?: (marked: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [needsReply, setNeedsReply] = useState(initialNeedsReply ?? true);
  const [suggestion, setSuggestion] = useState<{ reason: string } | null>(null);

  useEffect(() => {
    if (initialNeedsReply === undefined) return;
    setNeedsReply(initialNeedsReply ?? true);
    if (initialNeedsReply === false) {
      setSuggestion(null);
    }
  }, [initialNeedsReply]);

  async function probe() {
    setLoading(true);
    try {
      const r = await fetch("/functions/v1/reply-auto-mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, dry_run: true })
      });
      if (!r.ok) throw new Error(`Suggest failed (${r.status})`);
      const j = await r.json();
      setSuggestion(j.shouldMark ? { reason: j.reason } : null);
    } catch (error) {
      console.error("reply-auto-mark probe error", error);
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    setLoading(true);
    try {
      const r = await fetch("/functions/v1/reply-auto-mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: threadId })
      });
      if (!r.ok) throw new Error(`Accept failed (${r.status})`);
      const j = await r.json();
      if (j.marked) {
        setNeedsReply(false);
        setSuggestion(null);
        onMarked?.(true);
      }
    } catch (error) {
      console.error("reply-auto-mark accept error", error);
    } finally {
      setLoading(false);
    }
  }

  async function markManual() {
    setLoading(true);
    try {
      if (!lastInboundId) throw new Error("No inbound message");
      const r = await fetch("/api/threads/mark-replied", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, message_id: lastInboundId, reason: "manual" })
      });
      if (!r.ok) {
        const msg = await r.text();
        throw new Error(msg || `Manual mark failed (${r.status})`);
      }
      setNeedsReply(false);
      setSuggestion(null);
      onMarked?.(true);
    } catch (error) {
      console.error("reply-auto-mark manual error", error);
      const message = error instanceof Error ? error.message : "Manual mark failed";
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  const manualDisabled = loading || !lastInboundId;

  return (
    <div className="rounded-2xl border p-3 bg-muted/30 flex items-center gap-2">
      <div className="text-sm font-medium">Reply Status</div>
      {needsReply === false ? (
        <div className="text-xs text-muted-foreground">Marked replied ✅</div>
      ) : (
        <>
          <Button size="sm" onClick={markManual} disabled={manualDisabled}>
            Mark replied
          </Button>
          <Button size="sm" variant="outline" onClick={probe} disabled={loading}>Suggest</Button>
          {suggestion && (
            <div className="ml-2 text-xs">
              Autopilot suggests <span className="font-medium">mark replied</span> (<span className="italic">{suggestion.reason}</span>).
              <Button size="sm" className="ml-2" onClick={accept} disabled={loading}>Accept</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

