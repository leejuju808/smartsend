"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import CooldownPill from "@/components/inbox/CooldownPill";
import { toast } from "sonner";

type ThreadFlags = {
  is_nudged: boolean;
  is_snoozed: boolean;
};

export default function ThreadNudgeBadge({ threadId }: { threadId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [flags, setFlags] = React.useState<ThreadFlags | null>(null);
  const [nextAt, setNextAt] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [flagsRes, cooldownRes] = await Promise.all([
        fetch(`/api/thread/${threadId}/flags`, { cache: "no-store" }),
        fetch(`/api/thread/${threadId}/cooldown`, { cache: "no-store" }),
      ]);
      const [flagsPayload, cooldownPayload] = await Promise.all([flagsRes.json(), cooldownRes.json()]);

      if (flagsPayload?.ok) {
        setFlags({
          is_nudged: !!flagsPayload.flags?.is_nudged,
          is_snoozed: !!flagsPayload.flags?.is_snoozed,
        });
      } else {
        setFlags({ is_nudged: false, is_snoozed: false });
      }

      if (cooldownPayload?.ok) {
        setNextAt(cooldownPayload.cooldown?.next_eligible_at ?? null);
      } else {
        setNextAt(null);
      }
    } catch {
      setNextAt(null);
      setFlags({ is_nudged: false, is_snoozed: false });
    }
  }, [threadId]);

  React.useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("thread:flags:refresh", onRefresh);
    window.addEventListener("inbox:counts:refresh", onRefresh);
    return () => {
      window.removeEventListener("thread:flags:refresh", onRefresh);
      window.removeEventListener("inbox:counts:refresh", onRefresh);
    };
  }, [load]);

  const cancel = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/thread/${threadId}/nudge/cancel`, { method: "POST" });
      const payload = await response.json();

      if (!payload?.ok) {
        toast.error(payload?.error === "forbidden" ? "No permission to cancel." : "Failed to cancel.");
        return;
      }

      if (payload?.found) {
        toast.success("Nudge canceled.");
        setFlags((prev) => (prev ? { ...prev, is_nudged: false } : prev));
        window.dispatchEvent(new CustomEvent("inbox:counts:refresh"));
        window.dispatchEvent(new CustomEvent("thread:flags:refresh"));
        load();
      } else {
        toast("No draft nudge to cancel.");
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  if (!flags) {
    return <div className="h-5 w-28 animate-pulse rounded-full bg-muted/60" />;
  }

  return (
    <div className="flex items-center gap-2">
      <CooldownPill nextAt={nextAt} />
      {flags.is_nudged && (
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-[11px] uppercase tracking-wide text-foreground/80">
          Nudged
        </span>
      )}
      {flags.is_nudged && (
        <Button size="xs" variant="outline" onClick={cancel} disabled={loading}>
          {loading ? "Canceling…" : "Cancel nudge"}
        </Button>
      )}
    </div>
  );
}


