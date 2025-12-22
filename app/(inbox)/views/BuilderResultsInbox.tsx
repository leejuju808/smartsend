"use client";

import { Card } from "@/components/ui/card";

export function BuilderResultsInbox({ rows }: { rows: any[] }) {
  return (
    <div className="grid gap-2 mt-3">
      {rows.map((row: any) => (
        <Card key={row.id} className="p-3 text-sm flex items-center justify-between">
          <div className="truncate">
            <div className="font-medium">Thread {String(row.id).slice(0, 8)}…</div>
            <div className="text-xs opacity-70">
              score {row.score} · {row.has_meeting ? "meeting intent" : "—"} ·{" "}
              {row.last_at ? new Date(row.last_at).toLocaleString() : "n/a"}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

