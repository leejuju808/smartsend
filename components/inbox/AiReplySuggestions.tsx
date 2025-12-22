"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Suggestion = {
  label: string;
  body: string;
};

type Props = {
  lastReplyId: string;
  onApply: (body: string) => void; // hook into composer
};

export function AiReplySuggestions({ lastReplyId, onApply }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/reply/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: lastReplyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to load suggestions.");
      } else {
        setSuggestions(json.suggestions || []);
      }
    } catch (e: any) {
      setError(e.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!lastReplyId) return;
    load();
  }, [lastReplyId]);

  if (!lastReplyId) return null;

  return (
    <div className="border rounded p-3 space-y-2 bg-muted/60">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">AI Reply Suggestions</p>
        <Button
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {suggestions.map((s, idx) => (
          <div
            key={idx}
            className="border rounded px-2 py-2 text-xs space-y-1 bg-background"
          >
            <div className="font-medium">{s.label}</div>
            <p className="whitespace-pre-line text-[11px] text-muted-foreground">
              {s.body}
            </p>
            <Button
              size="sm"
              className="mt-1"
              onClick={() => onApply(s.body)}
            >
              Use this reply
            </Button>
          </div>
        ))}

        {!loading && suggestions.length === 0 && !error && (
          <p className="text-[11px] text-muted-foreground">
            No suggestions yet. Try refreshing.
          </p>
        )}
      </div>
    </div>
  );
}







