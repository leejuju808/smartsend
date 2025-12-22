++ 0
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ActionState = "idle" | "pushing" | "done" | "error";

export function MeetingAction({ intentId }: { intentId: string }) {
  const [state, setState] = useState<ActionState>("idle");

  const onPush = async () => {
    setState("pushing");
    try {
      const response = await fetch(`/api/meeting-intents/${intentId}/push`, { method: "POST" });
      await response.json().catch(() => null);
      setState(response.ok ? "done" : "error");
    } catch (error) {
      console.error("meeting push failed", error);
      setState("error");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onPush} disabled={state === "pushing"}>
        {state === "pushing" ? "Creating…" : state === "done" ? "Created" : "Create calendar event"}
      </Button>
      <a
        className="text-sm underline opacity-80"
        href={`/api/meeting-intents/${intentId}/ics`}
        target="_blank"
        rel="noreferrer"
      >
        Download .ics
      </a>
      {state === "error" ? <p className="text-sm text-destructive">Failed. Try again.</p> : null}
    </div>
  );
}


