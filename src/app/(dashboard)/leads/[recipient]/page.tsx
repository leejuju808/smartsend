"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface RecipientEvent { id: number; event_type: "sent"|"opened"|"clicked"|"bounced"; created_at: string; subject?: string|null; campaign_name?: string|null }

export default function RecipientPage() {
  const params = useParams<{ recipient: string }>();
  const recipient = decodeURIComponent(params.recipient);
  const [items, setItems] = React.useState<RecipientEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(()=>{
    (async()=>{
      setLoading(true);
      const res = await fetch(`/api/analytics/recipient/${encodeURIComponent(recipient)}`);
      const json = await res.json();
      setItems(json.items ?? []);
      setLoading(false);
    })();
  }, [recipient]);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lead timeline</h1>
        <p className="text-sm text-muted-foreground">{recipient}</p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin"/></div>
      ) : (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Events</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {items.map((e)=> (
                <li key={e.id} className="flex items-start gap-3">
                  <div className="pt-1"><Badge variant={badgeVariant(e.event_type)} className="capitalize">{e.event_type}</Badge></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{e.campaign_name ?? "Campaign"}</div>
                    {e.subject && <div className="text-sm text-muted-foreground truncate">{e.subject}</div>}
                    <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function badgeVariant(t: RecipientEvent["event_type"]) {
  switch (t) {
    case "sent": return "secondary" as const;
    case "opened": return "default" as const;
    case "clicked": return "outline" as const;
    case "bounced": return "destructive" as const;
  }
}