"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

type ReplyMarkButtonsProps = {
  threadId: string;
  isReplied: boolean;
};

export function ReplyMarkButtons({ threadId, isReplied }: ReplyMarkButtonsProps) {
  const [loading, setLoading] = useState(false);

  const call = useCallback(
    async (url: string, payload: Record<string, unknown>) => {
      setLoading(true);
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Force refresh to reflect latest status
        window.location.reload();
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  if (isReplied) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => call("/api/threads/unmark-replied", { thread_id: threadId, reason: "operator_unmark" })}
      >
        Unmark as Replied
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={loading}
      onClick={() => call("/api/threads/mark-replied", { thread_id: threadId, reason: "operator_mark" })}
    >
      Mark as Replied
    </Button>
  );
}






