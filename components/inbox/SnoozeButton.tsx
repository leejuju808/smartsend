"use client";

// Block 11900 — Inbox Snooze & Reminders v1
// Snooze button component for thread detail panel

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { SnoozeModal } from "./SnoozeModal";

interface SnoozeButtonProps {
  threadId: string;
  snoozedUntil?: string | null;
  onUnsnooze?: () => void;
  onSnoozed?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function SnoozeButton({
  threadId,
  snoozedUntil,
  onUnsnooze,
  onSnoozed,
  variant = "outline",
  size = "sm",
}: SnoozeButtonProps) {
  const [snoozeModalOpen, setSnoozeModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSnoozed = snoozedUntil && new Date(snoozedUntil) > new Date();

  const handleUnsnooze = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/inbox/replies/${threadId}/unsnooze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to unsnooze thread");
      }

      onUnsnooze?.();
    } catch (error) {
      console.error("Error unsnoozing thread:", error);
      alert(error instanceof Error ? error.message : "Failed to unsnooze thread");
    } finally {
      setLoading(false);
    }
  };

  if (isSnoozed) {
    const untilDate = new Date(snoozedUntil!);
    const formattedDate = untilDate.toLocaleDateString();
    const formattedTime = untilDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md bg-yellow-50 px-2 py-1 text-xs text-yellow-800 border border-yellow-200">
          <Clock className="h-3 w-3" />
          <span>
            Snoozed until {formattedDate} @ {formattedTime}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUnsnooze}
          disabled={loading}
          className="text-xs"
        >
          {loading ? "Unsnoozing..." : "Unsnooze"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setSnoozeModalOpen(true)}
        className="flex items-center gap-2"
      >
        <Clock className="h-4 w-4" />
        Snooze
      </Button>
      <SnoozeModal
        open={snoozeModalOpen}
        onOpenChange={setSnoozeModalOpen}
        threadId={threadId}
        onSnoozed={() => {
          onSnoozed?.();
          setSnoozeModalOpen(false);
        }}
      />
    </>
  );
}




























































