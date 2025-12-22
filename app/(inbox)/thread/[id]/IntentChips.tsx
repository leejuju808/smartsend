"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  action_required: "bg-red-500",
  question: "bg-amber-500",
  positive: "bg-emerald-600",
  neutral: "bg-slate-600",
  not_interested: "bg-zinc-600",
  routing: "bg-blue-600",
  ooo: "bg-purple-600",
  bounce: "bg-gray-600",
};

type LabelRow = {
  message_id: string;
  label_key: string;
  confidence: number;
  source: string;
};

export default function IntentChips({ threadId }: { threadId: string }) {
  const { data } = useSWR<LabelRow[]>(`/api/thread/${threadId}/labels`, (url) =>
    fetch(url).then((r) => r.json()),
  );

  const latest = (data ?? []).slice(0, 6);

  return (
    <div className="flex flex-wrap gap-2">
      {latest.map((l) => (
        <Badge key={`${l.message_id}-${l.label_key}`} className={cn("text-white", tone[l.label_key] ?? "bg-slate-600")}>
          {l.label_key.replaceAll("_", " ")} • {(l.confidence * 100).toFixed(0)}%
        </Badge>
      ))}
    </div>
  );
}



