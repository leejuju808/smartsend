"use client";
import { useEffect, useState } from "react";
import { supabaseRealtime } from "@/lib/realtimeClient";

export default function LiveNotifications() {
  const [notifs, setNotifs] = useState<any[]>([]);

  useEffect(() => {
    const channel = supabaseRealtime
      .channel("notif_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new;
          setNotifs(prev => [{ title: n.title, msg: n.message, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 10)]);
        })
      .subscribe();

    return () => {
      supabaseRealtime.removeChannel(channel);
    };
  }, []);

  return (
    <div className="rounded-2xl border p-4 h-64 overflow-auto">
      <h3 className="text-lg font-semibold mb-2">🔔 Live Notifications</h3>
      {notifs.map((n, i) => (
        <div key={i} className="text-sm border-b py-1">
          <div className="font-semibold">{n.title}</div>
          <div className="text-xs text-zinc-600">{n.msg}</div>
          <div className="text-[10px] text-zinc-400">{n.time}</div>
        </div>
      ))}
      {notifs.length === 0 && <p className="text-sm text-zinc-500">No new alerts yet</p>}
    </div>
  );
}