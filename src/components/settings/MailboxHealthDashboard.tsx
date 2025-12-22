"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AlertTriangle, TrendingDown, Mail, CheckCircle2 } from "lucide-react";

interface MailboxHealth {
  account_id: string;
  from_email: string;
  day: string;
  sent: number;
  bounces: number;
  complaints: number;
}

interface DomainHealth {
  domain: string;
  sent: number;
  bounces: number;
  bounce_rate: number;
}

interface AccountStats {
  id: string;
  from_email: string;
  daily_cap: number;
  today_sent: number;
  today_bounces: number;
  today_bounce_rate: number;
  is_throttled: boolean;
}

export default function MailboxHealthDashboard() {
  const supabase = createClientComponentClient();
  const [accounts, setAccounts] = useState<AccountStats[]>([]);
  const [domainHealth, setDomainHealth] = useState<Record<string, DomainHealth[]>>({});
  const [healthHistory, setHealthHistory] = useState<Record<string, MailboxHealth[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHealthData();
  }, []);

  const loadHealthData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      // Load connected accounts
      const { data: accountsData } = await supabase
        .from("connected_accounts")
        .select("id, from_email, email_address, email, account_email, daily_cap")
        .eq("user_id", user.id);

      if (!accountsData) return;

      const today = new Date().toISOString().slice(0, 10);
      const stats: AccountStats[] = [];
      const domainMap: Record<string, DomainHealth[]> = {};
      const historyMap: Record<string, MailboxHealth[]> = {};

      for (const acc of accountsData) {
        // Get today's stats from send_logs
        const { data: todayLogs } = await supabase
          .from("send_logs")
          .select("delivery_state, status")
          .eq("account_id", acc.id)
          .gte("created_at", today);

        const sent = todayLogs?.filter(l => l.status === "sent").length || 0;
        const bounces = todayLogs?.filter(l => l.delivery_state === "bounced").length || 0;
        const bounceRate = sent > 0 ? (bounces / sent) * 100 : 0;

        // Check if throttled (daily_cap reduced from default)
        const isThrottled = acc.daily_cap && acc.daily_cap < 40;

        const email = acc.from_email || acc.email_address || acc.email || acc.account_email || "Unknown";
        stats.push({
          id: acc.id,
          from_email: email,
          daily_cap: acc.daily_cap || 40,
          today_sent: sent,
          today_bounces: bounces,
          today_bounce_rate: bounceRate,
          is_throttled: isThrottled,
        });

        // Get domain health for today
        const { data: domainData } = await supabase
          .from("domain_health_daily")
          .select("domain, sent, bounces")
          .eq("account_id", acc.id)
          .eq("day", today);

        if (domainData) {
          domainMap[acc.id] = domainData.map((d) => ({
            domain: d.domain,
            sent: d.sent,
            bounces: d.bounces,
            bounce_rate: d.sent > 0 ? (d.bounces / d.sent) * 100 : 0,
          }));
        }

        // Get last 7 days history
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data: historyData } = await supabase
          .from("v_mailbox_health")
          .select("*")
          .eq("account_id", acc.id)
          .gte("day", sevenDaysAgo.toISOString().slice(0, 10))
          .order("day", { ascending: false });

        if (historyData) {
          historyMap[acc.id] = historyData;
        }
      }

      setAccounts(stats);
      setDomainHealth(domainMap);
      setHealthHistory(historyMap);
    } catch (err) {
      console.error("Error loading health data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading health data...</div>;
  }

  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Mailbox Health Dashboard</h2>

      {accounts.map((account) => (
        <div key={account.id} className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{account.from_email}</h3>
              {account.is_throttled && (
                <div className="flex items-center gap-2 mt-1 text-sm text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Auto-throttled (bounce rate too high)</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Today Sent</div>
              <div className="text-2xl font-semibold">{account.today_sent}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Bounce %</div>
              <div className={`text-2xl font-semibold ${account.today_bounce_rate > 5 ? "text-red-600" : ""}`}>
                {account.today_bounce_rate.toFixed(1)}%
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Daily Cap</div>
              <div className="text-2xl font-semibold">{account.daily_cap}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Status</div>
              <div className="flex items-center gap-2">
                {account.today_bounce_rate > 5 ? (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                )}
                <span className="text-sm">{account.today_bounce_rate > 5 ? "High Bounce" : "Healthy"}</span>
              </div>
            </div>
          </div>

          {/* Domain Breakdown */}
          {domainHealth[account.id] && domainHealth[account.id].length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Domain Breakdown (Today)</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Domain</th>
                      <th className="px-4 py-2 text-right">Sent</th>
                      <th className="px-4 py-2 text-right">Bounces</th>
                      <th className="px-4 py-2 text-right">Bounce %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainHealth[account.id].map((d, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2">{d.domain}</td>
                        <td className="px-4 py-2 text-right">{d.sent}</td>
                        <td className="px-4 py-2 text-right">{d.bounces}</td>
                        <td className={`px-4 py-2 text-right ${d.bounce_rate > 5 ? "text-red-600 font-medium" : ""}`}>
                          {d.bounce_rate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7-Day History */}
          {healthHistory[account.id] && healthHistory[account.id].length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Last 7 Days</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Day</th>
                      <th className="px-4 py-2 text-right">Sent</th>
                      <th className="px-4 py-2 text-right">Bounces</th>
                      <th className="px-4 py-2 text-right">Complaints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthHistory[account.id].map((h, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2">{new Date(h.day).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-right">{h.sent}</td>
                        <td className="px-4 py-2 text-right">{h.bounces}</td>
                        <td className="px-4 py-2 text-right">{h.complaints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

