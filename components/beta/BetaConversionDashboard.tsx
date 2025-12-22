// Block 10100 — "Holy Shit" Dashboard Component
// The dashboard moment that makes beta testers convert to paid

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BetaConversionMetrics {
  emails_sent: number;
  replies_received: number;
  hot_leads: number;
  leads_with_estimates: number;
  estimated_job_value: number;
  hours_to_first_reply: number | null;
  conversion_stage: string;
}

interface BetaConversionDashboardProps {
  betaTesterId: string;
  workspaceId?: string;
}

export function BetaConversionDashboard({
  betaTesterId,
  workspaceId,
}: BetaConversionDashboardProps) {
  const [metrics, setMetrics] = useState<BetaConversionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/beta/conversion-dashboard?beta_tester_id=${betaTesterId}`
        );
        if (!res.ok) {
          throw new Error("Failed to load metrics");
        }
        const json = await res.json();
        setMetrics(json.metrics);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, [betaTesterId]);

  if (loading) {
    return (
      <div className="border rounded-2xl p-6 bg-white">
        <div className="text-sm text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-2xl p-6 bg-white">
        <div className="text-sm text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  // Format estimated job value
  const formattedJobValue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(metrics.estimated_job_value);

  // Calculate reply rate
  const replyRate =
    metrics.emails_sent > 0
      ? ((metrics.replies_received / metrics.emails_sent) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-4">
      {/* Main "Holy Shit" Dashboard Card */}
      <div className="border-2 border-emerald-500 rounded-2xl p-6 bg-gradient-to-br from-emerald-50 to-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Your SmartSend Results
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              See how many roofing jobs SmartSend is generating for you
            </p>
          </div>
          {workspaceId && (
            <Link
              href={`/dashboard`}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              View Full Dashboard →
            </Link>
          )}
        </div>

        {/* Key Metrics Grid - The "Holy Shit" Moment */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <MetricCard
            label="📧 Emails Sent"
            value={metrics.emails_sent}
            highlight={metrics.emails_sent > 0}
          />
          <MetricCard
            label="💬 Homeowners Replied"
            value={metrics.replies_received}
            highlight={metrics.replies_received > 0}
            subtext={`${replyRate}% reply rate`}
          />
          <MetricCard
            label="🔥 Hot Leads"
            value={metrics.hot_leads}
            highlight={metrics.hot_leads > 0}
            subtext="Want estimates"
          />
          <MetricCard
            label="📋 Leads Created"
            value={metrics.leads_with_estimates}
            highlight={metrics.leads_with_estimates > 0}
            subtext="With estimates"
          />
          <MetricCard
            label="💰 Estimated Job Value"
            value={formattedJobValue}
            highlight={metrics.estimated_job_value > 0}
            subtext="From hot & warm leads"
            isLarge
          />
        </div>

        {/* Conversion Message */}
        {metrics.replies_received > 0 && metrics.conversion_stage === "ready_for_conversion" && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🎉</div>
              <div className="flex-1">
                <div className="font-semibold text-blue-900 mb-1">
                  Your outreach is working!
                </div>
                <div className="text-sm text-blue-800 mb-3">
                  You've received {metrics.replies_received} homeowner reply
                  {metrics.replies_received !== 1 ? "s" : ""}. Ready to ramp this up?
                </div>
                <Link
                  href={`/beta/conversion?beta_tester_id=${betaTesterId}`}
                  className="inline-block px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  View Founders Deal →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* First Reply Timing */}
        {metrics.hours_to_first_reply !== null && (
          <div className="mt-4 text-xs text-gray-600">
            ⚡ First reply received in{" "}
            {metrics.hours_to_first_reply < 24
              ? `${Math.round(metrics.hours_to_first_reply)} hours`
              : `${Math.round(metrics.hours_to_first_reply / 24)} days`}
          </div>
        )}
      </div>

      {/* Value Proposition */}
      {metrics.estimated_job_value > 0 && (
        <div className="border rounded-xl p-4 bg-slate-50">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            💡 What this means for you:
          </div>
          <div className="text-xs text-gray-700 space-y-1">
            <div>
              • {metrics.emails_sent} emails sent → {metrics.replies_received}{" "}
              replies → {metrics.hot_leads} hot leads
            </div>
            <div>
              • Potential revenue: {formattedJobValue} from leads in your
              pipeline
            </div>
            <div>
              • SmartSend costs $99–$399/month vs. $3,000–$10,000/month for
              marketing agencies
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight,
  subtext,
  isLarge,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  subtext?: string;
  isLarge?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-4 bg-white ${
        highlight ? "border-emerald-500 shadow-sm" : "border-gray-200"
      } ${isLarge ? "md:col-span-2" : ""}`}
    >
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div
        className={`text-2xl font-bold ${
          highlight ? "text-emerald-600" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {subtext && (
        <div className="text-[10px] text-gray-500 mt-1">{subtext}</div>
      )}
    </div>
  );
}























































