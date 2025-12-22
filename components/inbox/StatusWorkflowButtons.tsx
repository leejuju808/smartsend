"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type StatusWorkflowButtonsProps = {
  threadId: string;
  status: string;
  onStatusChange?: (status: string) => void;
};

export function StatusWorkflowButtons({
  threadId,
  status,
  onStatusChange,
}: StatusWorkflowButtonsProps) {
  const [updating, setUpdating] = useState(false);

  async function updateStatus(newStatus: string) {
    if (newStatus === status) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        onStatusChange?.(newStatus);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update status");
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  const statuses = ["open", "in_progress", "resolved", "closed"];

  return (
    <div className="flex gap-2">
      {statuses.map((s) => (
        <Button
          key={s}
          variant={status === s ? "default" : "outline"}
          onClick={() => updateStatus(s)}
          disabled={updating}
          size="sm"
        >
          {s.replace("_", " ")}
        </Button>
      ))}
    </div>
  );
}

