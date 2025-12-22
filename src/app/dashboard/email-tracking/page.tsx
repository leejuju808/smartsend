"use client";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";

const supabase = getBrowserSupabase();

interface EmailStats {
  sent: number;
  opened: number;
  replied: number;
}

export default function EmailTrackingDashboardPage() {
  const [stats, setStats] = useState<EmailStats>({ sent: 0, opened: 0, replied: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel("campaign_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_logs" },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchStats() {
    try {
      const { data, error } = await supabase
        .from("email_logs")
        .select("status, opened, replied_at");

      if (error) {
        console.error("Error fetching stats:", error);
        return;
      }

      const sent = data?.length || 0;
      const opened = data?.filter((e) => e.status === "opened" || e.opened === true).length || 0;
      const replied = data?.filter((e) => e.status === "replied" || e.replied_at !== null).length || 0;

      setStats({ sent, opened, replied });
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 text-white bg-black min-h-screen">
      <h1 className="text-3xl font-bold mb-6">📊 Campaign Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(stats).map(([key, value]) => (
          <div
            key={key}
            className="rounded-2xl bg-zinc-900 p-6 text-center border border-zinc-800 hover:border-yellow-400 transition-colors"
          >
            <h2 className="text-xl capitalize mb-2">{key}</h2>
            <p className="text-4xl font-bold text-yellow-400">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
} 