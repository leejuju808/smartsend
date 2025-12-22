"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { startWarmup, stopWarmup } from "./actions";

// Create client-side Supabase client
function getSupabaseClient() {
  if (typeof window === "undefined") return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function WarmupSettingsPage() {
  const [senders, setSenders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const sb = getSupabaseClient();
      if (!sb) return;
      
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      // Load sender profiles
      const { data: senderData } = await sb
        .from("sender_profiles")
        .select("id, email, provider, health_score")
        .eq("user_id", user.id);

      if (senderData) {
        setSenders(senderData);

        // Load warmup sessions
        const senderIds = senderData.map((s) => s.id);
        if (senderIds.length > 0) {
          const { data: sessionData } = await sb
            .from("warmup_sessions")
            .select("sender_id, active, daily_target, total_sent, last_sent_at")
            .in("sender_id", senderIds);

          const activeMap: Record<string, boolean> = {};
          sessionData?.forEach((s) => {
            activeMap[s.sender_id] = s.active;
          });
          setSessions(activeMap);
        }
      }

      setLoading(false);
    }
    load();
  }, []);

  async function toggleWarmup(senderId: string, currentlyActive: boolean) {
    try {
      if (currentlyActive) {
        await stopWarmup(senderId);
      } else {
        await startWarmup(senderId);
      }
      setSessions((prev) => ({ ...prev, [senderId]: !currentlyActive }));
    } catch (error) {
      console.error("Failed to toggle warmup:", error);
      alert("Failed to update warmup status");
    }
  }

  if (loading) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <p className="text-sm opacity-70">Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">SmartSend Warm-Up</h1>
        <p className="text-sm opacity-70">
          Automatically warm new sending accounts by exchanging friendly messages between verified inboxes.
          This builds domain reputation and improves inbox placement before full campaigns begin.
        </p>
      </div>

      {senders.length === 0 ? (
        <div className="border rounded-xl p-6 text-center">
          <p className="text-sm opacity-70">No sender profiles found. Add a sender profile to enable warm-up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {senders.map((sender) => {
            const isActive = sessions[sender.id] || false;
            const healthScore = sender.health_score ?? 0;

            return (
              <div key={sender.id} className="border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{sender.email}</div>
                    <div className="text-sm text-gray-500">
                      {sender.provider} • Health: {healthScore.toFixed(1)}%
                      {healthScore < 60 && (
                        <span className="ml-2 text-orange-600">
                          (needs improvement - warm-up will not run until &gt;60%)
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleWarmup(sender.id, isActive)}
                    disabled={healthScore < 60}
                    className={`rounded-xl border px-5 py-2 text-sm font-medium ${
                      isActive
                        ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                        : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isActive ? "Disable Warm-Up" : "Enable Warm-Up"}
                  </button>
                </div>
                {isActive && (
                  <div className="text-sm opacity-70 pt-2 border-t">
                    <p>✅ Warm-up is active. SmartSend will send daily friendly emails between your inboxes.</p>
                    <p className="mt-1">Daily target increases by +5 emails per day (capped at 50).</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border rounded-xl p-5 bg-blue-50 border-blue-200">
        <h2 className="font-semibold mb-2">How It Works</h2>
        <ul className="text-sm space-y-1 opacity-80">
          <li>• Runs daily at 8 AM UTC</li>
          <li>• Sends friendly messages between verified inboxes</li>
          <li>• Daily target starts at 5 emails, increases by +5 per day (max 50)</li>
          <li>• Success: +2 health_score per successful send (max 100)</li>
          <li>• Bounces: -5 health_score per bounce</li>
          <li>• Only healthy senders (health_score &gt; 60) participate</li>
        </ul>
      </div>
    </main>
  );
}

