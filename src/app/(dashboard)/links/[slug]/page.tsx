"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

export default function LinkPage() {
  const { slug } = useParams<{ slug: string }>();
  const url = decodeURIComponent(slug);
  const [data, setData] = React.useState<{ date:string; clicks:number }[]>([]);

  React.useEffect(()=>{ (async()=>{ const r = await fetch(`/api/analytics/links/detail?url=${encodeURIComponent(url)}`, { cache: "no-store" }); const j = await r.json(); setData(j.items||[]); })(); }, [url]);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Link analytics</h1>
      <p className="text-sm text-muted-foreground break-all">{url}</p>
      <Card>
        <CardHeader><CardTitle>Clicks over time</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ left:8, right:8, top:8, bottom:8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="clicks" name="Clicks" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}