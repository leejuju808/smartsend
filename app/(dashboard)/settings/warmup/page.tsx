"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Progress } from "@/components/ui/progress";

// Create client-side Supabase client
function getSupabaseClient() {
  if (typeof window === "undefined") return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type WarmupProfile = {
  account_id: string;
  enabled: boolean;
  daily_ramp_start: number;
  daily_ramp_increment: number;
  daily_ramp_cap: number;
  adaptive_enabled: boolean;
  adaptive_factor: number;
  last_recalc: string | null;
};

type WarmupHistory = {
  date: string;
  sent_count: number;
  bounces: number;
  complaints: number;
  engagement_score: number;
};

export default function WarmupPlannerPage() {
  const [profiles, setProfiles] = useState<WarmupProfile[]>([]);
  const [history, setHistory] = useState<Record<string, WarmupHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Record<string, { email: string; provider: string }>>({});

  useEffect(() => {
    async function load() {
      const sb = getSupabaseClient();
      if (!sb) return;

      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      // Load accounts
      const { data: accountsData } = await sb
        .from("accounts")
        .select("id, email_address, provider");

      if (accountsData) {
        const accountsMap: Record<string, { email: string; provider: string }> = {};
        accountsData.forEach((acc) => {
          accountsMap[acc.id] = {
            email: acc.email_address,
            provider: acc.provider,
          };
        });
        setAccounts(accountsMap);

        // Load warmup profiles
        const accountIds = accountsData.map((a) => a.id);
        if (accountIds.length > 0) {
          const { data: profilesData } = await sb
            .from("account_warmup_profiles")
            .select("*")
            .in("account_id", accountIds);

          if (profilesData) {
            setProfiles(profilesData);

            // Load last 7 days history for each account
            const historyMap: Record<string, WarmupHistory[]> = {};
            for (const profile of profilesData) {
              const { data: historyData } = await sb
                .from("warmup_history")
                .select("date, sent_count, bounces, complaints, engagement_score")
                .eq("account_id", profile.account_id)
                .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
                .order("date", { ascending: true });

              if (historyData) {
                historyMap[profile.account_id] = historyData;
              }
            }
            setHistory(historyMap);
          }
        }
      }

      setLoading(false);
    }
    load();
  }, []);

  async function handlePause(accountId: string) {
    const sb = getSupabaseClient();
    if (!sb) return;

    const { error } = await sb
      .from("account_warmup_profiles")
      .update({ enabled: false })
      .eq("account_id", accountId);

    if (error) {
      alert("Failed to pause warmup");
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => (p.account_id === accountId ? { ...p, enabled: false } : p))
    );
  }

  async function handleReset(accountId: string) {
    const sb = getSupabaseClient();
    if (!sb) return;

    const { error } = await sb
      .from("account_warmup_profiles")
      .update({
        daily_ramp_start: 30,
        adaptive_factor: 1.0,
        daily_ramp_increment: 30,
        daily_ramp_cap: 300,
      })
      .eq("account_id", accountId);

    if (error) {
      alert("Failed to reset ramp");
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.account_id === accountId
          ? {
              ...p,
              daily_ramp_start: 30,
              adaptive_factor: 1.0,
              daily_ramp_increment: 30,
              daily_ramp_cap: 300,
            }
          : p
      )
    );
  }

  async function handleBoost(accountId: string, percent: number) {
    const profile = profiles.find((p) => p.account_id === accountId);
    if (!profile) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    const newFactor = profile.adaptive_factor * (1 + percent / 100);
    const newInc = Math.round(profile.daily_ramp_increment * newFactor);
    const newCap = Math.min(2000, Math.round(profile.daily_ramp_cap * newFactor));

    const { error } = await sb
      .from("account_warmup_profiles")
      .update({
        adaptive_factor: newFactor,
        daily_ramp_increment: newInc,
        daily_ramp_cap: newCap,
      })
      .eq("account_id", accountId);

    if (error) {
      alert("Failed to boost warmup");
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.account_id === accountId
          ? {
              ...p,
              adaptive_factor: newFactor,
              daily_ramp_increment: newInc,
              daily_ramp_cap: newCap,
            }
          : p
      )
    );
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
        <h1 className="text-2xl font-semibold mb-2">Warmup Planner</h1>
        <p className="text-sm opacity-70">
          Adaptive warmup ramp tracking with engagement-based adjustments. Monitor daily performance
          and adjust ramp limits automatically based on open rates, replies, bounces, and complaints.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="border rounded-xl p-6 text-center">
          <p className="text-sm opacity-70">
            No warmup profiles found. Warmup profiles are created automatically for new accounts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((profile) => {
            const account = accounts[profile.account_id];
            const accountHistory = history[profile.account_id] || [];
            const todayHistory = accountHistory[accountHistory.length - 1];
            const quotaUsed = todayHistory
              ? (todayHistory.sent_count / profile.daily_ramp_cap) * 100
              : 0;

            return (
              <div key={profile.account_id} className="border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {account?.email || profile.account_id}
                    </div>
                    <div className="text-sm text-gray-500">
                      {account?.provider || "unknown"} • Current cap: {profile.daily_ramp_cap}{" "}
                      emails/day
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePause(profile.account_id)}
                      className="rounded-xl border px-4 py-2 text-sm font-medium bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                    >
                      Pause Warmup
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Daily Ramp Progress</span>
                      <span className="text-muted">
                        {todayHistory?.sent_count || 0} / {profile.daily_ramp_cap}
                      </span>
                    </div>
                    <Progress value={quotaUsed} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted">Adaptive factor:</span>{" "}
                      <span className="font-medium">
                        {profile.adaptive_factor?.toFixed(2) || "1.00"}×
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Last recalc:</span>{" "}
                      <span className="font-medium">
                        {profile.last_recalc
                          ? new Date(profile.last_recalc).toLocaleDateString()
                          : "Never"}
                      </span>
                    </div>
                  </div>

                  {accountHistory.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs font-medium mb-2">7-Day Performance</div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-muted">Avg Engagement</div>
                          <div className="font-medium">
                            {(
                              accountHistory.reduce(
                                (sum, h) => sum + (h.engagement_score || 0),
                                0
                              ) / accountHistory.length
                            ).toFixed(1)}
                            %
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Bounces</div>
                          <div className="font-medium text-red-600">
                            {accountHistory.reduce((sum, h) => sum + (h.bounces || 0), 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Complaints</div>
                          <div className="font-medium text-red-600">
                            {accountHistory.reduce((sum, h) => sum + (h.complaints || 0), 0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Total Sent</div>
                          <div className="font-medium">
                            {accountHistory.reduce((sum, h) => sum + (h.sent_count || 0), 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleReset(profile.account_id)}
                      className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Reset Ramp
                    </button>
                    <button
                      onClick={() => handleBoost(profile.account_id, 20)}
                      className="rounded-xl border px-4 py-2 text-sm font-medium bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    >
                      Manual Boost +20%
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border rounded-xl p-5 bg-blue-50 border-blue-200">
        <h2 className="font-semibold mb-2">How Adaptive Warmup Works</h2>
        <ul className="text-sm space-y-1 opacity-80">
          <li>• Daily stats are rolled up automatically from send outcomes</li>
          <li>• Engagement score combines opens, replies, bounces, and complaints</li>
          <li>• High engagement (&gt;70%) = faster ramp (1.2× multiplier)</li>
          <li>• Low engagement (&lt;40%) = slower ramp (0.8× multiplier)</li>
          <li>• High bounces/complaints = aggressive slowdown (0.6× multiplier)</li>
          <li>• Ramp limits recalculate nightly at 2 AM UTC</li>
          <li>• Dispatcher automatically respects daily caps</li>
        </ul>
      </div>
    </main>
  );
}
