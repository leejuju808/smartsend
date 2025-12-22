"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ApproveFirstDraft({ threadId }: { threadId: string }) {
  const [loading, setLoading] = React.useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await fetch(`/api/thread/${threadId}/first-draft`);
      const j = await r.json();
      if (!j?.id) {
        toast.info("No draft for this thread");
        return;
      }
      const a = await fetch(`/api/draft/${j.id}/approve`, { method: "POST" });
      if (!a.ok) {
        const e = await a.json().catch(() => ({}));
        throw new Error(e?.error ?? "Approve failed");
      }
      toast.success("Draft queued");
    } catch (e: any) {
      toast.error(e?.message ?? "Approve failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={loading}>
      {loading ? "Queuing…" : "Approve Draft"}
    </Button>
  );
}


