"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface GrowthKpis {
  total_signups?: number;
  activated_users?: number;
  activation_rate_pct?: number;
  paid_users?: number;
  upgrade_rate_pct?: number;
  total_referrals?: number;
  referral_conversions?: number;
  referral_conversion_rate_pct?: number;
  total_emails_sent?: number;
  total_campaigns_launched?: number;
  total_replies_received?: number;
  at_risk_users?: number;
  last_updated?: string;
}

interface FunnelData {
  signup_date: string;
  signups: number;
  activated_7d: number;
  converted_paid: number;
  churned_30d: number;
}

interface ReferralData {
  referrer_email: string;
  referrer_name: string;
  total_referrals: number;
  conversions: number;
  conversion_rate_pct: number;
}

export default function GrowthPage() {
  const [kpis, setKpis] = useState<GrowthKpis>({});
  const [funnel, setFunnel] = useState<FunnelData[]>([]);
  const [referrals, setReferrals] = useState<ReferralData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [kpiRes, funnelRes, referralRes] = await Promise.all([
          fetch("/api/admin/growth/kpis"),
          fetch("/api/admin/growth/funnel"),
          fetch("/api/admin/growth/referrals"),
        ]);

        if (kpiRes.ok) {
          const data = await kpiRes.json();
          setKpis(data);
        }

        if (funnelRes.ok) {
          const data = await funnelRes.json();
          setFunnel(data);
        }

        if (referralRes.ok) {
          const data = await referralRes.json();
          setReferrals(data);
        }

        setError(null);
      } catch (err) {
        console.error("Error fetching growth data:", err);
        setError("Failed to load growth metrics");
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
        <div className="text-lg">Loading growth metrics...</div>
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
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">🚀 Growth Dashboard</h1>

      {/* Growth Loop Metrics */}
      <section>
        <h2 className="text-xl font-bold mb-4">Growth Loop Metrics</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Total Signups</h3>
            <p className="text-2xl font-bold mt-2">{kpis.total_signups ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Activation Rate</h3>
            <p className="text-2xl font-bold mt-2">{kpis.activation_rate_pct ?? "—"}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.activated_users ?? 0} / {kpis.total_signups ?? 0} activated
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Upgrade Rate</h3>
            <p className="text-2xl font-bold mt-2">{kpis.upgrade_rate_pct ?? "—"}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.paid_users ?? 0} paid users
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Churn Risk</h3>
            <p className="text-2xl font-bold mt-2">{kpis.at_risk_users ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">30+ days inactive</p>
          </Card>
        </div>
      </section>

      {/* Usage Metrics */}
      <section>
        <h2 className="text-xl font-bold mb-4">Usage Metrics</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Total Emails Sent</h3>
            <p className="text-2xl font-bold mt-2">{kpis.total_emails_sent?.toLocaleString() ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Campaigns Launched</h3>
            <p className="text-2xl font-bold mt-2">{kpis.total_campaigns_launched?.toLocaleString() ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Replies Received</h3>
            <p className="text-2xl font-bold mt-2">{kpis.total_replies_received?.toLocaleString() ?? "—"}</p>
          </Card>
        </div>
      </section>

      {/* Referral Program */}
      <section>
        <h2 className="text-xl font-bold mb-4">Referral Program</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Total Referrals</h3>
            <p className="text-2xl font-bold mt-2">{kpis.total_referrals ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Conversions</h3>
            <p className="text-2xl font-bold mt-2">{kpis.referral_conversions ?? "—"}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Conversion Rate</h3>
            <p className="text-2xl font-bold mt-2">{kpis.referral_conversion_rate_pct ?? "—"}%</p>
          </Card>
        </div>

        {/* Top Referrers */}
        {referrals && referrals.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Top Referrers</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">User</th>
                    <th className="text-right p-2">Referrals</th>
                    <th className="text-right p-2">Conversions</th>
                    <th className="text-right p-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.slice(0, 10).map((ref, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{ref.referrer_name || ref.referrer_email}</td>
                      <td className="text-right p-2">{ref.total_referrals}</td>
                      <td className="text-right p-2">{ref.conversions}</td>
                      <td className="text-right p-2">{ref.conversion_rate_pct?.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Growth Funnel */}
      <section>
        <h2 className="text-xl font-bold mb-4">Growth Funnel (Last 30 Days)</h2>
        {funnel && funnel.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Signups</th>
                  <th className="text-right p-2">Activated (7d)</th>
                  <th className="text-right p-2">Converted</th>
                  <th className="text-right p-2">Churned</th>
                </tr>
              </thead>
              <tbody>
                {funnel.slice(0, 30).map((day, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{new Date(day.signup_date).toLocaleDateString()}</td>
                    <td className="text-right p-2">{day.signups}</td>
                    <td className="text-right p-2">{day.activated_7d}</td>
                    <td className="text-right p-2">{day.converted_paid}</td>
                    <td className="text-right p-2">{day.churned_30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No funnel data yet</div>
        )}
      </section>

      {/* Last Updated */}
      <div className="text-xs text-muted-foreground text-right">
        Last updated: {kpis.last_updated ? new Date(kpis.last_updated).toLocaleString() : "—"}
      </div>
    </div>
  );
}

