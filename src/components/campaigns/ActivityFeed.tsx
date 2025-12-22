'use client';

import useSWR from 'swr';
import { Card } from "@/components/ui/card";

function fetcher(url: string) { return fetch(url).then(r=>r.json()); }

export function ActivityFeed({ campaignId }: { campaignId: string }) {
  const { data } = useSWR(`/api/campaign-activity?c=${campaignId}`, fetcher, { refreshInterval: 10_000 });

  const rows: Array<any> = data?.rows ?? [];
  return (
    <Card className="p-4 space-y-3">
      <div className="font-semibold">Activity</div>
      <div className="space-y-2">
        {rows.map((r,i)=>(
          <div key={i} className="text-sm flex gap-2">
            <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            <span className="font-medium">{r.action}</span>
            <span className="text-muted-foreground">· {r.entity} {r.entity_id}</span>
          </div>
        ))}
        {rows.length===0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
      </div>
    </Card>
  );
}

