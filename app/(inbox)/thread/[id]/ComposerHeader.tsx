"use client";

import * as React from "react";
import {
  BadgeCheck,
  Ban,
  Calendar,
  Clock,
  Inbox,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ReplyLabel = "positive" | "neutral" | "oos" | "bounce" | "ooo" | "meeting_intent";

const COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  neutral: "bg-gray-100 text-gray-800",
  oos: "bg-red-100 text-red-800",
  bounce: "bg-pink-100 text-pink-800",
  ooo: "bg-amber-100 text-amber-800",
  meeting_intent: "bg-blue-100 text-blue-800",
  untyped: "bg-slate-100 text-slate-800",
};

type ComposerHeaderProps = {
  threadId: string;
  label: ReplyLabel | null;
  onLabelChange?: (label: ReplyLabel) => void;
};

export function ComposerHeader({ threadId, label, onLabelChange }: ComposerHeaderProps) {
  const [busy, setBusy] = React.useState(false);
  const [sla, setSla] = React.useState<{ due_at: string; overdue: boolean } | null>(null);

  const setLabel = React.useCallback(
    async (next: ReplyLabel) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/threads/${threadId}/label`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: next }),
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to set label");
        }

        onLabelChange?.(next);
        toast.success(`Label set to ${next}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to set label";
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [onLabelChange, threadId]
  );

  const markReplied = React.useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/threads/${threadId}/mark-replied`, {
        method: "POST",
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to mark replied");
      }

      toast.success("Marked as replied — follow-ups stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark replied";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [threadId]);

  const pill = label ?? "untyped";

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/inbox/needs-response`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const rows = (await response.json()) as Array<{
          thread_id: string;
          due_at: string;
          is_overdue: boolean;
        }>;
        if (cancelled) {
          return;
        }
        const match = rows.find((row) => row.thread_id === threadId);
        if (match) {
          setSla({ due_at: match.due_at, overdue: match.is_overdue });
        } else {
          setSla(null);
        }
      } catch {
        if (!cancelled) {
          setSla(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${COLORS[pill]}`}>
          {pill}
        </span>
        {sla && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              sla.overdue ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {sla.overdue ? "Overdue" : "Due"} {new Date(sla.due_at).toLocaleTimeString()}
          </span>
        )}
        <span className="text-xs opacity-70">Classifier inline</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setLabel("positive")} disabled={busy}>
          <ThumbsUp className="mr-1 h-4 w-4" />
          Positive
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLabel("neutral")} disabled={busy}>
          Neutral
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLabel("ooo")} disabled={busy}>
          <Clock className="mr-1 h-4 w-4" />
          OOO
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLabel("meeting_intent")}
          disabled={busy}
        >
          <Calendar className="mr-1 h-4 w-4" />
          Meeting
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLabel("oos")} disabled={busy}>
          <Ban className="mr-1 h-4 w-4" />
          OOS
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLabel("bounce")} disabled={busy}>
          <Inbox className="mr-1 h-4 w-4" />
          Bounce
        </Button>
        <Button size="sm" onClick={markReplied} disabled={busy}>
          <BadgeCheck className="mr-1 h-4 w-4" />
          Mark replied
        </Button>
      </div>
    </div>
  );
}

