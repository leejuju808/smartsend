"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";

type HotLeadRow = {
  id?: string;
  thread_id?: string;
  subject?: string | null;
  score?: number | null;
  has_meeting?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
  last_at?: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function HotLeadsList({ viewId }: { viewId: string }) {
  const { data } = useSWR<{ ok?: boolean; rows?: HotLeadRow[] }>(
    viewId ? `/api/saved-views/${viewId}/run` : null,
    fetcher,
    { refreshInterval: 8000, revalidateOnFocus: false }
  );

  const rows = data?.rows ?? [];

  return (
    <div className="grid gap-2">
      {rows.map((row) => {
        const id = row.id ?? row.thread_id;
        if (!id) return null;
        const timestamp = row.updated_at ?? row.last_at ?? row.created_at;
        const date = timestamp ? new Date(timestamp) : null;
        return (
          <Card key={id} className="flex items-center justify-between p-3 text-sm">
            <div className="truncate">
              <div className="font-medium">{row.subject ?? id}</div>
              <div className="text-xs opacity-70">
                score {row.score ?? "—"} · {row.has_meeting ? "meeting intent" : "hot"}
              </div>
            </div>
            <div className="text-xs opacity-60">{date ? date.toLocaleString() : "—"}</div>
          </Card>
        );
      })}
      {rows.length === 0 && (
        <Card className="p-3 text-sm text-muted-foreground">No hot leads match this view yet.</Card>
      )}
    </div>
  );
}

