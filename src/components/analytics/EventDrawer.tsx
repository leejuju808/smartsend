"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export type EmailEvent = {
  id: number;
  email_id: string | null;
  campaign_id: string | null;
  campaign_name?: string | null;
  event_type: "sent" | "opened" | "clicked" | "bounced";
  created_at: string;
  recipient?: string | null;
  subject?: string | null;
};

export function EventDrawer({ open, onOpenChange, campaignId, emailId }: { open: boolean; onOpenChange: (v:boolean)=>void; campaignId?: string; emailId?: string; }) {
  const [items, setItems] = React.useState<EmailEvent[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [title, setTitle] = React.useState<string>("Event log");

  const load = React.useCallback(async (reset=false) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    if (emailId) params.set("email_id", emailId);
    if (!reset && cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/analytics/events?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (reset) setItems(json.items); else setItems(prev => [...prev, ...json.items]);
    setCursor(json.next_cursor ?? null);
    setTitle(json.title ?? "Event log");
    setLoading(false);
  }, [campaignId, emailId, cursor]);

  React.useEffect(()=>{ if (open) { setItems([]); setCursor(null); load(true); } }, [open, load]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold">{title}</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-6">
              <ul className="space-y-3 py-4">
                {items.map((e)=> (
                  <li key={e.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant={badgeVariant(e.event_type)} className="capitalize">{e.event_type}</Badge>
                        <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      {e.recipient && (
                        <Link href={`/leads/${encodeURIComponent(e.recipient)}`} className="text-xs font-medium underline underline-offset-2">
                          {e.recipient}
                        </Link>
                      )}
                    </div>
                    <div className="mt-1 text-sm">
                      {e.subject && <div className="truncate text-muted-foreground">{e.subject}</div>}
                    </div>
                  </li>
                ))}
              </ul>
              {loading && (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin"/></div>
              )}
              {!loading && cursor && (
                <div className="flex items-center justify-center py-4">
                  <button onClick={()=>load(false)} className="rounded-full border px-4 py-2 text-sm">Load more</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function badgeVariant(t: EmailEvent["event_type"]) {
  switch (t) {
    case "sent": return "secondary" as const;
    case "opened": return "default" as const;
    case "clicked": return "outline" as const;
    case "bounced": return "destructive" as const;
  }
}