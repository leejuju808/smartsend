"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ResumeButtonProps = {
  threadId: string;
  disabled?: boolean;
  onResumed?: () => void;
};

export function ResumeButton({ threadId, disabled, onResumed }: ResumeButtonProps) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/followups/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error ?? "Failed to resume follow-ups");
      }

      toast.success("Follow-ups resumed");
      onResumed?.();
      window.dispatchEvent(new CustomEvent("thread:list:refresh"));
      window.dispatchEvent(new CustomEvent("inbox:counts:refresh"));
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resume follow-ups";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={onClick} disabled={disabled || loading}>
      {loading ? "Resuming..." : "Resume follow-ups"}
    </Button>
  );
}





