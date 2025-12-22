"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type InboxMessage = {
  id: string;
  created_at: string;
  direction?: string | null;
  ai_label?: string | null;
  ai_confidence?: number | null;
  subject?: string | null;
  body_text?: string | null;
};

type InboxThread = {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  updated_at: string;
  replied_at: string | null;
  messages: InboxMessage[];
};

const labelColor: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  question: "bg-blue-100 text-blue-700",
  neutral: "bg-slate-100 text-slate-700",
  negative: "bg-rose-100 text-rose-700",
  unsubscribe: "bg-yellow-100 text-yellow-800",
  ooo: "bg-violet-100 text-violet-700",
  bounce: "bg-zinc-100 text-zinc-700",
  auto: "bg-zinc-100 text-zinc-700",
  unknown: "bg-gray-100 text-gray-700",
};

const FILTERS = [
  { label: "all", text: "All" },
  { label: "positive", text: "Positive" },
  { label: "question", text: "Questions" },
  { label: "neutral", text: "Neutral" },
  { label: "negative", text: "Negative" },
  { label: "unsubscribe", text: "Unsubscribes" },
  { label: "ooo", text: "OOO" },
  { label: "bounce", text: "Bounces" },
];

function Chip({ label }: { label: string }) {
  const key = label || "unknown";
  const c = labelColor[key] || labelColor.unknown;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${c}`}>{label || "unknown"}</span>;
}

export default function InboxPageClient({ initial }: { initial: InboxThread[] }) {
  const [threads] = useState(initial);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (activeFilter === "all") return threads;
    return threads.filter((thread) => {
      const last = thread.messages?.[0];
      return (last?.ai_label || "unknown") === activeFilter;
    });
  }, [threads, activeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.label}
            variant={activeFilter === f.label ? "default" : "outline"}
            className="rounded-full text-xs"
            onClick={() => setActiveFilter(f.label)}
          >
            {f.text}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((thread) => {
          const last = thread.messages?.[0];
          const subject = last?.subject ?? "(no subject)";
          const preview = last?.body_text ?? "";
          const label = last?.ai_label ?? "unknown";
          return (
            <div key={thread.id} className="rounded-2xl border p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium truncate">{subject}</div>
                <Chip label={label} />
              </div>
              {preview && (
                <div className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">{preview}</div>
              )}
              <div className="text-xs text-muted-foreground">
                Updated {new Date(thread.updated_at).toLocaleString()}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No threads match this filter yet.
          </div>
        )}
      </div>
    </div>
  );
}













