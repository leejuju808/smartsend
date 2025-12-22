"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface FounderMetrics {
  kpis: {
    mrr: number;
    churn: number;
    activation: number;
    partner_roi: number;
  };
  cash: {
    months_left: number | null;
  };
}

export default function FounderDashboard() {
  const [data, setData] = useState<FounderMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/founder-metrics");
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setError(null);
        } else if (res.status === 403) {
          setError("Access denied - Founder access only");
        } else {
          setError("Failed to load metrics");
        }
      } catch (err) {
        console.error("Error fetching founder metrics:", err);
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
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading founder metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-lg">No data available</div>
      </div>
    );
  }

  const k = data.kpis || {};
  const c = data.cash || {};

  // Calculate ARR from MRR
  const arr = (k.mrr || 0) * 12;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">📈 SmartSend Quarterly Command Center</h1>
        <div className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* MRR */}
        <Card className="p-6 border-2 hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">MRR</p>
              <h2 className="text-3xl font-bold mt-2">${(k.mrr || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
              <p className="text-xs text-muted-foreground mt-2">
                ARR: ${arr.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-4xl">💰</div>
          </div>
        </Card>

        {/* Churn */}
        <Card className="p-6 border-2 hover:border-red-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Churn</p>
              <h2 className="text-3xl font-bold mt-2">{k.churn || 0}%</h2>
              <p className="text-xs text-muted-foreground mt-2">
                Target: &lt; 5%
              </p>
            </div>
            <div className="text-4xl">📉</div>
          </div>
        </Card>

        {/* Activation */}
        <Card className="p-6 border-2 hover:border-green-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Activation</p>
              <h2 className="text-3xl font-bold mt-2">{k.activation || 0}%</h2>
              <p className="text-xs text-muted-foreground mt-2">
                First success rate
              </p>
            </div>
            <div className="text-4xl">⚡</div>
          </div>
        </Card>

        {/* Partner ROI */}
        <Card className="p-6 border-2 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Partner ROI</p>
              <h2 className="text-3xl font-bold mt-2">{k.partner_roi || 0}%</h2>
              <p className="text-xs text-muted-foreground mt-2">
                Referral efficiency
              </p>
            </div>
            <div className="text-4xl">🤝</div>
          </div>
        </Card>

        {/* Cash Runway */}
        <Card className="p-6 border-2 hover:border-orange-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cash Runway</p>
              <h2 className="text-3xl font-bold mt-2">
                {c.months_left ? `${Math.round(c.months_left)} mo` : "—"}
              </h2>
              <p className="text-xs text-muted-foreground mt-2">
                {c.months_left && c.months_left < 6 ? "⚠️ Low runway" : "Months remaining"}
              </p>
            </div>
            <div className="text-4xl">🛣️</div>
          </div>
        </Card>

        {/* ARR Trajectory to $1M */}
        <Card className="p-6 border-2 hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Progress to $1M ARR</p>
              <h2 className="text-3xl font-bold mt-2">{Math.min(100, (arr / 10000)).toFixed(1)}%</h2>
              <p className="text-xs text-muted-foreground mt-2">
                ${arr.toLocaleString()} / $1,000,000
              </p>
            </div>
            <div className="text-4xl">🎯</div>
          </div>
        </Card>
      </div>

      {/* Insights Section */}
      <Card className="p-6 mt-8">
        <h2 className="text-xl font-bold mb-4">🎯 Growth Levers</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">If MRR ↑ + Churn ↓ →</h3>
            <p className="text-sm text-blue-700">Double down on retention campaigns & product improvements</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">If Activation ↓ →</h3>
            <p className="text-sm text-green-700">Revise onboarding emails & simplify first-time success</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <h3 className="font-semibold text-purple-900 mb-2">If Partner ROI ↑ →</h3>
            <p className="text-sm text-purple-700">Increase commission tiers & incentivize referrals</p>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <h3 className="font-semibold text-orange-900 mb-2">If Cash Runway ↓ →</h3>
            <p className="text-sm text-orange-700">Prioritize MRR growth & consider fundraising</p>
          </div>
        </div>
      </Card>

      {/* Quarterly Review Reminder */}
      <Card className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold mb-2">📅 Quarterly Review</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Export metrics every 90 days to track growth trajectory and identify levers
            </p>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/founder-metrics/quarterly-report', {
                    method: 'POST',
                  });
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `quarterly-report-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    alert("Quarterly report downloaded!");
                  } else {
                    alert("Failed to generate report");
                  }
                } catch (error) {
                  console.error("Error generating report:", error);
                  alert("Error generating report");
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Export Quarterly Report
            </button>
          </div>
          <div className="text-4xl">📊</div>
        </div>
      </Card>
    </div>
  );
}

