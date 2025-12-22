"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";

interface CampaignMetric {
  campaign_id: string;
  campaign_name: string;
  emails_sent: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
  reply_rate_pct: number;
  open_rate_pct: number;
  click_rate_pct: number;
}

export default function CampaignAnalytics() {
  const [metrics, setMetrics] = useState<CampaignMetric[]>([]);
  const [aiInsights, setAiInsights] = useState<string>("Loading...");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/campaign-metrics");
        const j = await res.json();
        setMetrics(j.data || []);
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      }

      try {
        const ai = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-dashboard-summary`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
        });
        const aj = await ai.json();
        setAiInsights(aj.insights || "No insights yet.");
      } catch (error) {
        console.error("Failed to fetch AI insights:", error);
        setAiInsights("Unable to generate insights at this time.");
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="font-semibold mb-2">⚡ AI Insights</h2>
        <p className="text-sm whitespace-pre-wrap">{aiInsights}</p>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        {metrics.length === 0 ? (
          <div className="col-span-3 text-center text-gray-500 py-8">
            No campaign metrics available yet. Create and send a campaign to see analytics.
          </div>
        ) : (
          metrics.map((m) => (
            <Card key={m.campaign_id} className="p-4">
              <h3 className="font-semibold mb-1">{m.campaign_name}</h3>
              <CardContent className="p-0 space-y-1 text-sm">
                <p>📤 Sent: {m.emails_sent}</p>
                <p>📨 Replies: {m.replies}</p>
                <p>🔥 Reply Rate: {m.reply_rate_pct}%</p>
                <p>📬 Opens: {m.opens}</p>
                <p>🖱 Clicks: {m.clicks}</p>
                <p>🚫 Bounces: {m.bounces}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

