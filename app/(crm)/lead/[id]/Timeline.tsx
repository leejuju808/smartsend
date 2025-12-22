"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";

const tone: Record<string, string> = {
  message_in: "bg-blue-600",
  message_out: "bg-emerald-600",
  status_change: "bg-amber-600",
  owner_change: "bg-purple-600",
  task_open: "bg-zinc-600",
  task_done: "bg-zinc-700",
  automation: "bg-cyan-600",
  system: "bg-slate-600",
  note: "bg-indigo-600",
};

type LeadActivity = {
  id: string;
  created_at: string;
  kind: string;
  title: string | null;
  body: string | null;
};

export default function Timeline({ leadId }: { leadId: string }) {
  const { data } = useSWR(`/api/leads/${leadId}/timeline`, (url) => fetch(url).then((r) => r.json()));

  const items: LeadActivity[] = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border p-3">
          <div className="flex items-center gap-2 text-xs">
            <Badge className={`text-white ${tone[item.kind] ?? "bg-slate-600"}`}>
              {item.kind.replace("_", " ")}
            </Badge>
            <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
          </div>
          {item.title ? <div className="mt-1 text-sm font-medium">{item.title}</div> : null}
          {item.body ? <div className="mt-1 whitespace-pre-wrap text-sm">{item.body}</div> : null}
        </div>
      ))}
      {items.length === 0 ? <div className="text-sm text-muted-foreground">No activity yet.</div> : null}
    </div>
  );
}


