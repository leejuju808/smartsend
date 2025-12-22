"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export type InboxLabelCounts = {
  untyped: number;
  positive: number;
  neutral: number;
  question: number;
  negative: number;
  ooo: number;
};

const labels: { key: keyof InboxLabelCounts | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "untyped", label: "Untyped" },
  { key: "positive", label: "Positive" },
  { key: "neutral", label: "Neutral" },
  { key: "question", label: "Question" },
  { key: "negative", label: "Negative" },
  { key: "ooo", label: "OOO" },
];

export function InboxFilterBar({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: InboxLabelCounts | null;
}) {
  function n(k: keyof InboxLabelCounts | "all") {
    if (!counts) return "";
    if (k === "all") {
      const { untyped, positive, neutral, question, negative, ooo } = counts;
      return untyped + positive + neutral + question + negative + ooo;
    }
    return (counts as any)[k] ?? 0;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((l) => (
        <Button
          key={l.key}
          size="sm"
          variant={value === l.key ? "default" : "outline"}
          onClick={() => onChange(l.key)}
          className="rounded-full"
        >
          {l.label}
          <span className="ml-2 rounded-full bg-muted px-2 text-xs">{n(l.key)}</span>
        </Button>
      ))}
    </div>
  );
}


