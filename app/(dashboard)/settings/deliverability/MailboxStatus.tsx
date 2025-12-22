"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function MailboxStatus() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { 
    fetch("/api/mailboxes/health")
      .then(r=>r.json())
      .then(j=>setRows(j.data||[]))
      .catch(err => console.error("Failed to fetch mailbox health:", err));
  }, []);

  if (!rows.length) return null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {rows.map((m)=> {
        const pct = Math.min(100, Math.round((m.send_quota_used / Math.max(1, m.send_quota_per_day)) * 100));
        const expSoon = new Date(m.expires_at).getTime() - Date.now() < 10*60*1000;
        return (
          <Card key={m.id}>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">{m.email} <Badge variant="secondary">{m.provider}</Badge></CardTitle>
              {expSoon ? <Badge variant="destructive">Refresh soon</Badge> : <Badge>OK</Badge>}
            </CardHeader>
            <CardContent>
              <div className="text-sm mb-1">Daily quota: {m.send_quota_used}/{m.send_quota_per_day}</div>
              <Progress value={pct} />
              <div className="text-xs text-muted-foreground mt-1">Resets at {m.quota_reset_at ? new Date(m.quota_reset_at).toLocaleString() : "—"}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}















