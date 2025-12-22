"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface MetricsData {
  active_users?: number;
  mrr?: number;
  activation_rate?: number;
  referrals?: number;
  emails?: number;
  top_channel?: string;
  ph_upvotes?: number;
  demo_clicks?: number;
  signups_this_week?: number;
  active_paid_users?: number;
  upgrade_rate?: number;
  churn_rate?: number;
  avg_engagement_score?: number;
  at_risk_users?: number;
  healthy_users?: number;
}

interface ChannelData {
  channel: string;
  reply_rate: number;
}

export default function MetricsPage() {
  const [data, setData] = useState<MetricsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, analyticsRes] = await Promise.all([
          fetch("/api/admin/metrics"),
          fetch("/api/analytics")
        ]);

        if (metricsRes.ok) {
          const j = await metricsRes.json();
          setData(j);
          setError(null);
        } else if (metricsRes.status === 403) {
          setError("Access denied");
        } else {
          setError("Failed to load metrics");
        }

        // Fetch analytics to get top channel
        if (analyticsRes.ok) {
          const analytics = await analyticsRes.json();
          const channels: ChannelData[] = analytics.channels || [];
          
          // Find channel with highest reply rate
          const topChannel = channels.length > 0
            ? channels.reduce((prev, curr) => 
                (curr.reply_rate || 0) > (prev.reply_rate || 0) ? curr : prev
              )
            : null;

          setData(prev => ({
            ...prev,
            top_channel: topChannel ? topChannel.channel : "Email"
          }));
        }
      } catch (err) {
        console.error("Error fetching metrics:", err);
        setError("Failed to load metrics");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">📊 SmartSend Growth Dashboard</h1>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">🧍 Active Users (7d)</h3>
          <p className="text-2xl font-bold mt-2">{data.active_users ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">💸 Monthly Recurring Revenue</h3>
          <p className="text-2xl font-bold mt-2">${data.mrr?.toLocaleString() ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">⚡ Activation Rate</h3>
          <p className="text-2xl font-bold mt-2">{data.activation_rate ?? "—"}%</p>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">🔁 Referrals Activated</h3>
          <p className="text-xl font-bold mt-2">{data.referrals ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">📬 Emails Sent (This Month)</h3>
          <p className="text-xl font-bold mt-2">{data.emails?.toLocaleString() ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">🏆 Top Channel</h3>
          <p className="text-xl font-bold mt-2">{data.top_channel ?? "Email"}</p>
          <p className="text-xs text-muted-foreground mt-1">Highest reply rate this week</p>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">💳 Active Paid Users</h3>
          <p className="text-2xl font-bold mt-2">{data.active_paid_users ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">From Stripe subscriptions</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">📈 Upgrade Rate</h3>
          <p className="text-2xl font-bold mt-2">{data.upgrade_rate ? `${data.upgrade_rate.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">% of free users who upgraded</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">📉 Churn Rate</h3>
          <p className="text-2xl font-bold mt-2">{data.churn_rate ? `${data.churn_rate.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">Canceled / total subscriptions</p>
        </Card>
      </div>

      <div className="border-t pt-6">
        <h2 className="text-xl font-bold mb-4">🚀 Launch Metrics</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">🔼 Product Hunt Upvotes</h3>
            <p className="text-2xl font-bold mt-2">{data.ph_upvotes ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">👆 Demo Clicks</h3>
            <p className="text-2xl font-bold mt-2">{data.demo_clicks?.toLocaleString() ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">✨ Sign-Ups (This Week)</h3>
            <p className="text-2xl font-bold mt-2">{data.signups_this_week ?? "—"}</p>
          </Card>
        </div>
      </div>

      <div className="border-t pt-6">
        <h2 className="text-xl font-bold mb-4">💚 Customer Health</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Avg. Engagement Score</h3>
            <p className="text-2xl font-bold mt-2">{data.avg_engagement_score ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Target ≥ 75</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">🏥 At-Risk Users</h3>
            <p className="text-2xl font-bold mt-2">{data.at_risk_users ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Score &lt; 40</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">✅ Healthy Users</h3>
            <p className="text-2xl font-bold mt-2">{data.healthy_users ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">Score ≥ 75</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

