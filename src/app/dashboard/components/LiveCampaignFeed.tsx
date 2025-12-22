"use client";
import { useEffect, useState } from "react";
import { supabaseRealtime } from "@/lib/realtimeClient";
import { Badge } from "@/components/ui/badge";

export default function LiveCampaignFeed() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const channel = supabaseRealtime
      .channel("send_queue_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "send_queue" },
        (payload) => {
          setEvents(prev => [
            { type: payload.eventType, record: payload.new || payload.old, time: new Date().toLocaleTimeString() },
            ...prev.slice(0, 50),
          ]);
        })
      .subscribe();

    return () => {
      supabaseRealtime.removeChannel(channel);
    };
  }, []);

  return (
    <div className="rounded-2xl border p-4 h-80 overflow-auto space-y-2">
      <h3 className="text-lg font-semibold">⚡ Live Campaign Feed</h3>
      {events.length === 0 && <p className="text-sm text-zinc-500">Waiting for activity...</p>}
      {events.map((e, i) => (
        <div key={i} className="border-b pb-1 text-sm">
          <Badge className="mr-2">{e.type}</Badge>
          {e.record?.to_email ? `Email → ${e.record.to_email}` : "Record changed"}
          <div className="text-xs text-zinc-500">{e.time}</div>
        </div>
      ))}
    </div>
  );
}