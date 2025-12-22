"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type Event = {
  created_at: string;
  actor: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  meta: any;
};

function labelize(e: Event) {
  const who = e.actor_email || (e.actor ? e.actor.slice(0, 6) + "…" : "system");
  const when = new Date(e.created_at).toLocaleString();
  const what = e.action.replace(/_/g, " ");
  return `${when} — ${who} ${what}`;
}

export function ActivityCard({ campaignId }: { campaignId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  
  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/activity?limit=20`)
      .then((r) => r.json())
      .then((j) => setEvents(j.events || []))
      .catch(() => setEvents([]));
  }, [campaignId]);

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-auto">
          {events.map((e, i) => (
            <div key={i} className="text-xs">
              <div>{labelize(e)}</div>
              {e.meta && Object.keys(e.meta).length > 0 && (
                <pre className="bg-muted/40 p-2 rounded mt-1 overflow-auto text-[10px]">
                  {JSON.stringify(e.meta, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-xs text-muted-foreground">No activity yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}



