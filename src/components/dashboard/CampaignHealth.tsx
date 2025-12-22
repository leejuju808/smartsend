"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function CampaignHealth({ campaignId }: { campaignId: string }) {
  const [health, setHealth] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function load() {
      try {
        // Fetch health data from view
        const { data: healthData, error: hErr } = await supabase
          .from("v_campaign_health")
          .select("*")
          .eq("campaign_id", campaignId)
          .maybeSingle();

        if (hErr) {
          console.error("Error loading health:", hErr);
        } else {
          setHealth(healthData || null);
        }

        // Fetch policy
        try {
          const policyRes = await fetch(`/api/campaigns/${campaignId}/guardrails`);
          if (policyRes.ok) {
            const policyData = await policyRes.json();
            setPolicy(policyData || null);
          }
        } catch (e) {
          console.error("Error loading policy:", e);
        }
      } catch (e) {
        console.error("Error:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
    // Refresh every 30 seconds
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [campaignId, supabase]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Health & Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const bouncePct = ((health?.bounce_rate_7d || 0) * 100).toFixed(1);
  const unsubPct = ((health?.unsub_rate_7d || 0) * 100).toFixed(1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Health & Limits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-muted-foreground">Sent (7d)</div>
            <div className="text-xl font-semibold">{health?.sent_7d ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Unsubs (7d)</div>
            <div className="text-xl font-semibold">{unsubPct}%</div>
          </div>
          <div>
            <div className="text-muted-foreground">Bounces (7d)</div>
            <div className="text-xl font-semibold">{bouncePct}%</div>
          </div>
          <div>
            <div className="text-muted-foreground">Caps</div>
            <div className="text-xl font-semibold">
              {policy?.max_hourly ?? 40}/hr • {policy?.max_daily ?? 200}/day
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Warmup: start {policy?.warmup_start ?? 20}/day, +{policy?.warmup_increment ?? 10}/day for{" "}
          {policy?.warmup_days ?? 10} days (capped at daily max).
        </p>
      </CardContent>
    </Card>
  );
}

