"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";

export default function CampaignQueueMonitor({ campaignId }: { campaignId: string }) {
  const supabase = createClientComponentClient();
  const [rows, setRows] = useState<any[]>([]);

  const fetchRows = async () => {
    const { data } = await supabase
      .from("send_queue")
      .select("id, to_email, state, schedule_at, attempts, last_error")
      .eq("campaign_id", campaignId)
      .order("schedule_at", { ascending: true })
      .limit(200);
    setRows(data || []);
  };

  useEffect(() => {
    fetchRows();
    const ch = supabase.channel("queue-rt")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "send_queue",
        filter: `campaign_id=eq.${campaignId}`
      }, fetchRows)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId]);

  const forceSync = async () => {
    await fetch("/api/mail/force-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "auto" })
    });
  };

  return (
    <Card>
      <CardHeader className="flex justify-between">
        <div className="font-semibold">Send Queue</div>
        <Button variant="outline" size="sm" onClick={forceSync}>Force Sync</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between border rounded-md p-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.to_email}</div>
              <div className="text-xs text-muted-foreground">
                at {new Date(r.schedule_at).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={
                r.state === "sent" ? "default" :
                r.state === "failed" ? "destructive" :
                r.state === "sending" ? "secondary" : "outline"
              }>
                {r.state}
              </Badge>
              {r.last_error && (
                <span className="text-xs text-red-500 max-w-[220px] truncate">
                  {r.last_error}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

