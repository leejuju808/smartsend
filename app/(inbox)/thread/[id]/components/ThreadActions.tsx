"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

async function postJSON(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.error) {
    const message = payload?.error ?? "Request failed";
    throw new Error(message);
  }

  return payload ?? { ok: true };
}

type ThreadActionsProps = {
  threadId: string;
  leadId?: string | null;
  autoPaused: boolean;
  isMuted: boolean;
};

export function ThreadActions({ threadId, leadId, autoPaused, isMuted }: ThreadActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = React.useCallback(
    (label: string, action: () => Promise<any>) => async () => {
      if (busy) return;
      setBusy(label);
      try {
        await action();
        toast.success("Updated thread");
        router.refresh();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("thread:list:refresh"));
          window.dispatchEvent(new CustomEvent("inbox:counts:refresh"));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong";
        toast.error(message);
      } finally {
        setBusy(null);
      }
    },
    [busy, router],
  );

  const renderSnoozeButton = (days: number) => (
    <Button
      key={days}
      size="sm"
      variant="outline"
      onClick={run(`snooze-${days}`, () => postJSON(`/api/threads/${threadId}/snooze`, { days }))}
      disabled={busy !== null}
      title={`Pause and resume in ${days} day${days > 1 ? "s" : ""}`}
    >
      Snooze {days}d
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {[1, 3, 7, 14, 30].map(renderSnoozeButton)}
      {autoPaused ? (
        <Button
          size="sm"
          variant="outline"
          onClick={run("unpause", () => postJSON(`/api/threads/${threadId}/unpause`))}
          disabled={busy !== null}
        >
          Unpause
        </Button>
      ) : null}
      {leadId && isMuted ? (
        <Button
          size="sm"
          variant="default"
          onClick={run("unmute", () => postJSON(`/api/leads/${leadId}/unmute`))}
          disabled={busy !== null}
        >
          Unmute Lead
        </Button>
      ) : null}
    </div>
  );
}


