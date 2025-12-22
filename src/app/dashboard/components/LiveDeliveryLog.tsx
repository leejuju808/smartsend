"use client";
import { useEffect, useState } from "react";
import { supabaseRealtime } from "@/lib/realtimeClient";

export default function LiveDeliveryLog() {
  const [logs, setLogs] = useState<any[]>([]);
  
  useEffect(() => {
    const channel = supabaseRealtime
      .channel("delivery_logs_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "send_logs" },
        (payload) => {
          const l = payload.new;
          setLogs(prev => [
            { to: l.to_email, status: l.status, time: new Date(l.created_at).toLocaleTimeString() },
            ...prev.slice(0, 50)
          ]);
        })
      .subscribe();
    
    return () => supabaseRealtime.removeChannel(channel);
  }, []);
  
  return (
    <div className="rounded-2xl border p-4 h-80 overflow-auto">
      <h3 className="text-lg font-semibold">📬 Live Delivery Log</h3>
      {logs.map((l, i) => (
        <div key={i} className="text-sm border-b py-1">
          <b>{l.to}</b> — {l.status}
          <div className="text-xs text-zinc-500">{l.time}</div>
        </div>
      ))}
      {logs.length === 0 && <p className="text-sm text-zinc-500">No deliveries yet</p>}
    </div>
  );
}