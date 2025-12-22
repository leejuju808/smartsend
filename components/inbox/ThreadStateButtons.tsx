"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

type ThreadStateButtonsProps = {
  threadId: string;
  state?: string | null;
  onStateChange?: () => void;
};

export function ThreadStateButtons({
  threadId,
  state,
  onStateChange,
}: ThreadStateButtonsProps) {
  const [updating, setUpdating] = useState(false);
  const router = useRouter();

  async function closeThread() {
    if (state === "closed") return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/replies/thread/${threadId}/close`, {
        method: "POST",
      });

      if (res.ok) {
        onStateChange?.();
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to close thread");
      }
    } catch (error) {
      console.error("Failed to close thread:", error);
      alert("Failed to close thread");
    } finally {
      setUpdating(false);
    }
  }

  async function reopenThread() {
    if (state !== "closed") return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/replies/thread/${threadId}/reopen`, {
        method: "POST",
      });

      if (res.ok) {
        onStateChange?.();
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to reopen thread");
      }
    } catch (error) {
      console.error("Failed to reopen thread:", error);
      alert("Failed to reopen thread");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex gap-2">
      {state === "closed" ? (
        <Button
          variant="outline"
          onClick={reopenThread}
          disabled={updating}
          size="sm"
        >
          Reopen Thread
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={closeThread}
          disabled={updating}
          size="sm"
        >
          Close Thread
        </Button>
      )}
    </div>
  );
}










