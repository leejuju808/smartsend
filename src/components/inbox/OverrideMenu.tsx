// components/inbox/OverrideMenu.tsx
"use client";

import { Button } from "@/components/ui/Button";

const KINDS = [
  "human",
  "ooo",
  "auto",
  "bounce",
  "unsubscribe",
  "spam",
  "unknown",
] as const;

export function OverrideMenu({
  eventId,
  threadId,
  campaignId,
  canEdit,
}: {
  eventId: string;
  threadId: string;
  campaignId: string;
  canEdit: boolean;
}) {
  if (!canEdit) return null;

  async function handleOverride(kind: string) {
    try {
      const r = await fetch(`/api/email-events/${eventId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          thread_id: threadId,
          campaign_id: campaignId,
        }),
      });
      if (r.ok) {
        // Reload to show updated classification
        window.location.reload();
      } else {
        const error = await r.json();
        console.error("Error overriding classification:", error);
        alert(`Error: ${error.error || "Failed to override"}`);
      }
    } catch (err) {
      console.error("Error overriding classification:", err);
      alert("Failed to override classification");
    }
  }

  return (
    <div className="flex flex-wrap gap-1 p-2 border rounded-lg bg-muted/50">
      <div className="text-xs font-medium mb-1 w-full">Override classification:</div>
      {KINDS.map((k) => (
        <Button
          key={k}
          size="sm"
          variant="secondary"
          onClick={() => handleOverride(k)}
          className="text-xs"
        >
          {k}
        </Button>
      ))}
    </div>
  );
}

