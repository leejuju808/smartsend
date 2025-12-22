"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function LeadPreviewDialog({
  open,
  onOpenChange,
  leadId,
  campaignId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  campaignId: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<{ subject: string; body: string } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch("/api/render-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leadId, campaignId }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Preview failed");
        setData({ subject: j.subject, body: j.body });
      } catch (err) {
        setData({ subject: "", body: (err as Error)?.message || "Failed to render" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, leadId, campaignId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview email</DialogTitle>
        </DialogHeader>
        {loading && <div className="p-4 text-sm">Loading…</div>}
        {!loading && data && (
          <div className="space-y-3">
            <div className="font-semibold">{data.subject}</div>
            <pre className="whitespace-pre-wrap text-sm rounded-lg border p-3">{data.body}</pre>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


