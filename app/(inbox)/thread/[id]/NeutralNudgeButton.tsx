"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";

type DraftPayload = { subject: string; body: string };

type Activity = {
  lastInboundAt?: string | null;
  lastNudgeAt?: string | null;
};

type Props = {
  threadId: string;
  activity?: Activity | null;
  onDraft?: (payload: DraftPayload) => void;
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) {
    return "Available soon";
  }
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `Available in ${days} day${days === 1 ? "" : "s"}`;
}

export function NeutralNudgeButton({ threadId, activity, onDraft }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [localActivity, setLocalActivity] = React.useState<Activity>({
    lastInboundAt: activity?.lastInboundAt ?? null,
    lastNudgeAt: activity?.lastNudgeAt ?? null,
  });

  const availability = React.useMemo(() => {
    const now = Date.now();
    let readyAt = now;

    const lastInboundAt = parseTime(localActivity.lastInboundAt);
    if (lastInboundAt) {
      readyAt = Math.max(readyAt, lastInboundAt + FORTY_EIGHT_HOURS_MS);
    }

    const lastNudgeAt = parseTime(localActivity.lastNudgeAt);
    if (lastNudgeAt) {
      readyAt = Math.max(readyAt, lastNudgeAt + FIVE_DAYS_MS);
    }

    const isReady = readyAt <= now;
    const remaining = isReady ? 0 : readyAt - now;
    const recentlyNudged = Boolean(lastNudgeAt && lastNudgeAt >= now - FIVE_DAYS_MS);

    return {
      isReady,
      tooltip: isReady ? undefined : formatRemaining(remaining),
      recentlyNudged,
    };
  }, [localActivity.lastInboundAt, localActivity.lastNudgeAt]);

  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/draft-neutral-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text };
      }

      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : text || "Failed to draft";
        throw new Error(message);
      }

      if (data?.throttled) {
        toast.message("Nudge paused by throttle window");
        return;
      }

      onDraft?.({ subject: data.subject, body: data.body });
      toast.success("Nudge draft ready");
      setLocalActivity((prev) => ({
        ...prev,
        lastNudgeAt: new Date().toISOString(),
      }));
      window.dispatchEvent(new CustomEvent("thread:flags:refresh"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to draft";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [onDraft, threadId]);

  const disabled = loading || !availability.isReady;

  return (
    <div className="flex items-center gap-2">
      {availability.recentlyNudged && (
        <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-900">
          Neutral (nudged)
        </Badge>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={run}
        disabled={disabled}
        title={availability.tooltip}
      >
        {loading ? "Drafting…" : "Draft Nudge"}
      </Button>
    </div>
  );
}


