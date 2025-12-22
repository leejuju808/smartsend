// components/campaign/RunSendEngineButton.tsx
// Block 8145 — Run Send Engine Now (manual trigger)

"use client";

import * as React from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Props = {
  size?: "sm" | "default";
};

export function RunSendEngineButton({ size = "default" }: Props) {
  const { push } = useToast();
  const [isRunning, setIsRunning] = React.useState(false);

  async function handleClick() {
    if (isRunning) return;
    setIsRunning(true);

    try {
      const res = await fetch("/api/smartsend/run-send-engine", {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        push({
          title: "Send engine error",
          description:
            data?.error ??
            "Something went wrong while triggering the queue processor.",
          type: "error",
        });
        return;
      }

      const processed = data.processed ?? 0;

      push({
        title: "Send engine ran",
        description:
          processed > 0
            ? `Processed ${processed} queued emails.`
            : "No ready jobs in the queue.",
        type: "success",
      });
    } catch (err) {
      console.error("RunSendEngineButton error:", err);
      push({
        title: "Send engine error",
        description: "Unexpected error while calling the queue processor.",
        type: "error",
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Button
      size={size}
      variant="outline"
      className="gap-2"
      onClick={handleClick}
      disabled={isRunning}
    >
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Running engine…</span>
        </>
      ) : (
        <>
          <PlayCircle className="h-4 w-4" />
          <span>Run Send Engine</span>
        </>
      )}
    </Button>
  );
}

