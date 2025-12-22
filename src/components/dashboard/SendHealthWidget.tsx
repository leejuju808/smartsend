"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/Card";

export function SendHealthWidget(){
  const { data } = useSWR("/api/send-stats", (u)=>fetch(u).then(r=>r.json()), { refreshInterval: 10000 });
  const q = data?.queue || [];
  const ev = data?.events || [];
  const rl = ev.find((e:any)=>e.kind==='rate_limit')?.count ?? 0;
  const errs = ev.find((e:any)=>e.kind==='error')?.count ?? 0;

  return (
    <Card className="p-4">
      <div className="font-medium">Send Health (24h)</div>
      <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
        <div><div className="opacity-60">Queued</div><div className="text-lg">{q.find((x:any)=>x.status==='scheduled')?.count ?? 0}</div></div>
        <div><div className="opacity-60">Running</div><div className="text-lg">{q.find((x:any)=>x.status==='running')?.count ?? 0}</div></div>
        <div><div className="opacity-60">Errors</div><div className="text-lg">{errs}</div></div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Rate-limit events (24h): {rl}</div>
    </Card>
  );
}

