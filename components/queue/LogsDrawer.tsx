"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type LogRow = {
  id: string;
  created_at: string;
  event: string;
  meta: any;
  campaign_name?: string;
  lead_email?: string;
};

export function LogsDrawer({
  open, onOpenChange, title, leadId, queueId,
}: { open: boolean; onOpenChange: (v: boolean) => void; title: string; leadId?: string; queueId?: string; }) {
  const [rows, setRows] = React.useState<LogRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (queueId) p.set("queueId", queueId);
      if (leadId) p.set("leadId", leadId);
      const res = await fetch(`/api/logs/search?${p.toString()}`);
      const json = await res.json();
      setRows(res.ok && json.ok ? json.rows : []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { if (open) load(); }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[80vh] overflow-hidden w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-1 pb-6 overflow-auto h-full">
          {loading ? <div className="text-sm text-muted-foreground">Loading logs…</div> : (
            rows.length === 0 ? <div className="text-sm text-muted-foreground">No logs yet.</div> : (
              <ol className="space-y-3">
                {rows.map(r => (
                  <li key={r.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      <span className="uppercase tracking-wide">{r.event}</span>
                    </div>
                    {r.lead_email && <div className="text-sm mt-1"><b>Lead:</b> {r.lead_email}</div>}
                    {r.campaign_name && <div className="text-sm"><b>Campaign:</b> {r.campaign_name}</div>}
                    {r.meta && (
                      <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(r.meta, null, 2)}</pre>
                    )}
                  </li>
                ))}
              </ol>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


