"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { toast } from "sonner";

type MergeRow = {
  id: string;
  created_at: string;
  primary_lead: string;
  secondary_lead: string;
  primary_email: string | null;
  secondary_email: string | null;
  strategy?: string | null;
};

export function MergeHistory() {
  const [rows, setRows] = React.useState<MergeRow[]>([]);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/dupes/history?limit=50");
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to load history");
      }
      const json = await response.json();
      setRows(json.rows ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load history");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const undo = React.useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/dupes/undo/${id}`, { method: "POST" });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Undo failed");
        }
        toast.success("Merge undone");
        load();
      } catch (err: any) {
        toast.error(err?.message ?? "Undo failed");
      }
    },
    [load]
  );

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Card key={row.id} className="flex items-center justify-between p-3">
          <div className="text-sm">
            <div className="font-medium">
              {row.primary_email ?? row.primary_lead} ⇄ {row.secondary_email ?? row.secondary_lead}
            </div>
            <div className="text-xs text-muted-foreground">
              on {new Date(row.created_at).toLocaleString()}
              {row.strategy ? ` · strategy: ${row.strategy}` : null}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => undo(row.id)}>
            Undo
          </Button>
        </Card>
      ))}
      {!rows.length ? <div className="text-sm text-muted-foreground">No recent merges.</div> : null}
    </div>
  );
}



