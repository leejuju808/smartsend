"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type DraftPayload = {
  subject: string;
  body: string;
  ics?: { opt1?: string | null; opt2?: string | null };
  labels?: { opt1Label: string; opt2Label: string };
};

type Props = {
  threadId: string;
  onDraft?: (payload: DraftPayload) => void;
};

export function ScheduleDraftButton({ threadId, onDraft }: Props) {
  const [loading, setLoading] = React.useState(false);

  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/draft-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();

      onDraft?.({
        subject: data.subject,
        body: data.body,
        ics: { opt1: data.ics_opt1_url, opt2: data.ics_opt2_url },
        labels: data.options,
      });

      toast.success("Schedule draft ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to draft";
      toast.error(message || "Failed to draft");
    } finally {
      setLoading(false);
    }
  }, [onDraft, threadId]);

  return (
    <Button size="sm" onClick={run} disabled={loading}>
      {loading ? "Drafting…" : "Draft Schedule"}
    </Button>
  );
}








