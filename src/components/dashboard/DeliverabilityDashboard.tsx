// Block 181: Deliverability Dashboard Component
// Shows deliverability status for all domains in the workspace

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface DeliverabilityStats {
  id: string;
  account_id: string;
  domain: string;
  sent_24h: number;
  bounces_24h: number;
  complaints_24h: number;
  unsubscribes_24h: number;
  reputation_score: number;
}

interface DeliverabilityDashboardProps {
  workspaceId: string;
}

export function DeliverabilityDashboard({ workspaceId }: DeliverabilityDashboardProps) {
  const [stats, setStats] = useState<DeliverabilityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    async function fetchStats() {
      try {
        // Get all campaigns in workspace to find account_ids and domains
        const { data: campaigns } = await supabase
          .from("campaigns")
          .select("account_id, from_email")
          .eq("workspace_id", workspaceId)
          .not("account_id", "is", null)
          .not("from_email", "is", null);

        if (!campaigns || campaigns.length === 0) {
          setStats([]);
          setLoading(false);
          return;
        }

        // Extract unique account_id + domain combinations
        const uniqueCombos = new Map<string, { accountId: string; domain: string }>();
        for (const camp of campaigns) {
          if (camp.account_id && camp.from_email) {
            const domain = camp.from_email.split('@')[1]?.toLowerCase();
            if (domain) {
              const key = `${camp.account_id}:${domain}`;
              if (!uniqueCombos.has(key)) {
                uniqueCombos.set(key, { accountId: camp.account_id, domain });
              }
            }
          }
        }

        // Fetch stats for each unique combination
        const statsPromises = Array.from(uniqueCombos.values()).map(async ({ accountId, domain }) => {
          const { data } = await supabase
            .from("deliverability_stats")
            .select("*")
            .eq("account_id", accountId)
            .eq("domain", domain)
            .maybeSingle();

          return data;
        });

        const results = await Promise.all(statsPromises);
        setStats(results.filter((s): s is DeliverabilityStats => s !== null));
      } catch (err) {
        console.error("Error fetching deliverability stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [workspaceId, supabase]);

  if (loading) {
    return (
      <div className="border rounded p-4 bg-gray-50">
        <div className="text-sm text-gray-500">Loading deliverability status...</div>
      </div>
    );
  }

  if (stats.length === 0) {
    return null; // No stats yet
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Deliverability Status</h3>
      {stats.map((stat) => {
        const score = stat.reputation_score;
        const bounceRate = stat.sent_24h > 0 
          ? ((stat.bounces_24h / stat.sent_24h) * 100).toFixed(2)
          : "0.00";
        const unsubscribeRate = stat.sent_24h > 0
          ? ((stat.unsubscribes_24h / stat.sent_24h) * 100).toFixed(2)
          : "0.00";

        const isLowReputation = score < 60;
        const isWarning = score < 80;
        const hasBounceSpike = stat.bounces_24h > 20;
        const hasUnsubscribeSurge = stat.unsubscribes_24h > 10;
        const hasHighBounceRate = parseFloat(bounceRate) > 8;

        const bgColor = isLowReputation 
          ? "bg-red-50 border-red-200" 
          : isWarning 
          ? "bg-yellow-50 border-yellow-200" 
          : "bg-green-50 border-green-200";

        const textColor = isLowReputation 
          ? "text-red-800" 
          : isWarning 
          ? "text-yellow-800" 
          : "text-green-800";

        return (
          <div key={stat.id} className={`border rounded p-4 ${bgColor}`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-semibold text-sm">{stat.domain}</div>
                <div className="text-xs text-gray-600">Reputation Score</div>
              </div>
              <div className="text-right">
                {isLowReputation ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : isWarning ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                <div className={`text-lg font-bold ${textColor}`}>
                  {score}/100
                </div>
              </div>
            </div>

            {stat.sent_24h > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Sent (24h): {stat.sent_24h}</div>
                  <div>Bounces: {stat.bounces_24h} ({bounceRate}%)</div>
                  <div>Unsubscribes: {stat.unsubscribes_24h} ({unsubscribeRate}%)</div>
                  {stat.complaints_24h > 0 && (
                    <div className="text-red-600">Complaints: {stat.complaints_24h}</div>
                  )}
                </div>
              </div>
            )}

            {isLowReputation && (
              <div className="mt-2 pt-2 border-t border-red-200">
                <p className="text-xs text-red-600 font-medium">
                  ⚠ Your domain is at risk. SmartSend has auto-paused some campaigns.
                </p>
                {(hasBounceSpike || hasHighBounceRate) && (
                  <p className="text-xs text-red-600 mt-1">
                    • High bounce rate detected
                  </p>
                )}
                {hasUnsubscribeSurge && (
                  <p className="text-xs text-red-600 mt-1">
                    • Unsubscribe surge detected
                  </p>
                )}
                {stat.complaints_24h > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    • Complaints received
                  </p>
                )}
              </div>
            )}

            {isWarning && !isLowReputation && (
              <div className="mt-2 pt-2 border-t border-yellow-200">
                <p className="text-xs text-yellow-700">
                  ⚠ Monitor your domain reputation. Consider reducing send volume.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}












