"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ExplainResponse = {
  rows?: number;
  ms?: number;
  plan?: string;
};

export function ExplainButton({ viewId }: { viewId: string }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<ExplainResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/saved-views/${viewId}/explain`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to run EXPLAIN");
      }
      setData(json as ExplainResponse);
    } catch (err: any) {
      setError(err?.message ?? "Failed to run EXPLAIN");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [viewId]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        Explain
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Query Plan</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="text-sm text-muted-foreground">Running EXPLAIN…</div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {!loading && !error && data ? (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">
              Rows: {data.rows ?? 0} · {Math.round(data.ms ?? 0)} ms{"\n"}
              {data.plan ?? ""}
            </pre>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}


