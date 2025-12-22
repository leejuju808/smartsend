"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function Campaigns() {
  const [rows, setRows] = React.useState<any[]>([]);
  React.useEffect(() => {
    fetch("/api/campaigns/kpis")
      .then((r) => r.json())
      .then((j) => setRows(j.rows ?? []));
  }, []);

  return (
    <div className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r: any) => (
        <Link key={r.campaign_id} href={`/campaign/${r.campaign_id}`}>
          <Card className="rounded-2xl shadow-sm hover:shadow-md transition">
            <CardContent className="p-4">
              <div className="text-sm font-semibold">{r.name}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                Sent {r.sent} • Replies {r.replies} • RR {r.reply_rate_pct}%
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}




