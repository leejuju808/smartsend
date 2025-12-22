"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function QueueStats() {
  const sb = createClientComponentClient();
  const [stats, setStats] = useState<{
    queued: number;
    processing: number;
    retrying: number;
    failed: number;
    sentToday: number;
  }>({
    queued: 0,
    processing: 0,
    retrying: 0,
    failed: 0,
    sentToday: 0,
  });

  async function load() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const q = (status: string) =>
      sb
        .from("send_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", status);

    const [a, b, c, d] = await Promise.all([
      q("queued"),
      q("processing"),
      q("retrying"),
      q("failed"),
    ]);

    const { data: quota } = await sb
      .from("send_quotas")
      .select("sent_in_window")
      .eq("user_id", user.id)
      .maybeSingle();

    setStats({
      queued: a.count || 0,
      processing: b.count || 0,
      retrying: c.count || 0,
      failed: d.count || 0,
      sentToday: quota?.sent_in_window ?? 0,
    });
  }

  useEffect(() => {
    load();
    const ch = sb
      .channel("queue_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "send_queue" },
        load
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  return (
    <div className="grid grid-cols-5 gap-3">
      {["Queued", "Processing", "Retrying", "Failed", "Sent Today"].map(
        (label, i) => {
          const val = [
            stats.queued,
            stats.processing,
            stats.retrying,
            stats.failed,
            stats.sentToday,
          ][i];
          return (
            <div key={label} className="rounded-2xl border border-zinc-800 p-4">
              <div className="text-sm text-zinc-400">{label}</div>
              <div className="text-2xl font-semibold">{val}</div>
            </div>
          );
        }
      )}
    </div>
  );
}

