"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";

type ErrorRow = {
  created_at: string;
  kind: string;
  message?: string | null;
  context?: Record<string, unknown> | null;
};

export function ErrorsCard() {
  const [rows, setRows] = React.useState<ErrorRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/dupes/errors")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setRows(json.rows ?? []);
        }
      })
      .catch((err) => {
        console.error("Failed to load dupe error events", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows.length) {
    return null;
  }

  return (
    <Card className="p-3">
      <div className="mb-2 font-medium">Recent Errors</div>
      <div className="space-y-1 text-sm">
        {rows.map((row, idx) => (
          <div key={`${row.created_at}-${idx}`} className="flex items-start gap-2">
            <span className="opacity-60">{new Date(row.created_at).toLocaleString()}</span>
            <span className="rounded bg-destructive/10 px-1.5 py-0.5">{row.kind}</span>
            <span className="truncate">{row.message ?? "—"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}



