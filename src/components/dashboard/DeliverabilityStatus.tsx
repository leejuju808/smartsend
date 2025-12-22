// Block 181: Deliverability Status Component
// Displays domain reputation score and warnings in dashboard

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

interface DeliverabilityStatusProps {
  accountId?: string;
  domain?: string;
}

export function DeliverabilityStatus({ accountId, domain }: DeliverabilityStatusProps) {
  const [stats, setStats] = useState<DeliverabilityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (!accountId || !domain) {
      setLoading(false);
      return;
    }

    async function fetchStats() {
      try {
        const { data, error } = await supabase
          .from("deliverability_stats")
          .select("*")
          .eq("account_id", accountId)
          .eq("domain", domain)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          // PGRST116 = no rows returned, which is fine
          console.error("Error fetching deliverability stats:", error);
        }

        setStats(data);
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
  }, [accountId, domain, supabase]);

  if (loading) {
    return (
      <div className="border rounded p-4 bg-gray-50">
        <div className="text-sm text-gray-500">Loading deliverability status...</div>
      </div>
    );
  }

  if (!stats) {
    return null; // No stats yet, don't show anything
  }

  const score = stats.reputation_score;
  const bounceRate = stats.sent_24h > 0 
    ? ((stats.bounces_24h / stats.sent_24h) * 100).toFixed(2)
    : "0.00";
  const unsubscribeRate = stats.sent_24h > 0
    ? ((stats.unsubscribes_24h / stats.sent_24h) * 100).toFixed(2)
    : "0.00";

  const isLowReputation = score < 60;
  const isWarning = score < 80;
  const hasBounceSpike = stats.bounces_24h > 20;
  const hasUnsubscribeSurge = stats.unsubscribes_24h > 10;
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
    <div className={`border rounded p-4 ${bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Deliverability Status</h3>
        {isLowReputation ? (
          <XCircle className="h-4 w-4 text-red-600" />
        ) : isWarning ? (
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-600" />
        )}
      </div>

      <div className="space-y-1 text-sm">
        <div>
          <span className="text-gray-600">Domain: </span>
          <span className="font-medium">{stats.domain}</span>
        </div>
        <div>
          <span className="text-gray-600">Reputation Score: </span>
          <span className={`font-semibold ${textColor}`}>
            {score}/100
          </span>
        </div>

        {stats.sent_24h > 0 && (
          <>
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-600">
                <div>Sent (24h): {stats.sent_24h}</div>
                <div>Bounces: {stats.bounces_24h} ({bounceRate}%)</div>
                <div>Unsubscribes: {stats.unsubscribes_24h} ({unsubscribeRate}%)</div>
                {stats.complaints_24h > 0 && (
                  <div className="text-red-600">Complaints: {stats.complaints_24h}</div>
                )}
              </div>
            </div>
          </>
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
            {stats.complaints_24h > 0 && (
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
    </div>
  );
}












