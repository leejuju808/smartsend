"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Draft = { subject: string; body: string };

export function CloseDraftButton({
  threadId,
  onDraft,
}: {
  threadId: string;
  onDraft?: (draft: Draft) => void;
}) {
  const [loading, setLoading] = React.useState(false);

  async function run() {
    setLoading(true);
    try {
      const resp = await fetch("/api/draft-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });

      if (!resp.ok) {
        const message = await resp.text();
        throw new Error(message || "Failed to draft");
      }

      const data = (await resp.json()) as { subject: string; body: string };
      onDraft?.({ subject: data.subject, body: data.body });
      toast.success("Close-the-loop draft ready");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to draft";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={run} disabled={loading}>
      {loading ? "Drafting…" : "Draft Close"}
    </Button>
  );
}







