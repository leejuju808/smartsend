'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TAGS = ["positive", "negative", "neutral", "question", "unsubscribe", "bounce", "oof"] as const;

type Props = {
  messageId: string;
  text?: string | null;
};

export function QuickTags({ messageId, text }: Props) {
  const [loadingTag, setLoadingTag] = useState<string | null>(null);

  const click = async (signal: (typeof TAGS)[number]) => {
    try {
      setLoadingTag(signal);
      const res = await fetch("/api/inbox/auto-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId, text, signal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Failed to tag message");
      }
      toast.success(`Tagged as ${signal}`);
    } catch (err) {
      console.error("quick tag failed", err);
      toast.error(err instanceof Error ? err.message : "Tagging failed");
    } finally {
      setLoadingTag(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {TAGS.map((t) => (
        <Button
          key={t}
          size="sm"
          variant="outline"
          disabled={loadingTag !== null}
          onClick={() => click(t)}
        >
          {loadingTag === t ? "Tagging…" : t}
        </Button>
      ))}
    </div>
  );
}
















