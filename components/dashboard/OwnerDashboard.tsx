"use client";

import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useCampaignPerformance } from "@/hooks/useCampaignPerformance";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useRevenueSummary } from "@/hooks/useRevenueSummary";
import { useRevenueByCampaign } from "@/hooks/useRevenueByCampaign";
import { useWorkspaceProfile } from "@/hooks/useWorkspaceProfile";
import { useLeadSourceBreakdown } from "@/hooks/useLeadSourceBreakdown";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { TaskListPanel } from "@/components/tasks/TaskListPanel";
import { PipelineWinForecast } from "@/components/PipelineWinForecast";
import Link from "next/link";

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="bg-white border rounded-2xl p-3 flex flex-col">
      <span className="text-xs text-gray-500 mb-1">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
      {hint && <span className="text-[10px] text-gray-400 mt-1">{hint}</span>}
    </div>
  );
}

export default function OwnerDashboard() {
  const { stats, loading: summaryLoading } = useDashboardSummary();
  const { campaigns, loading: campaignsLoading } = useCampaignPerformance();
  const { workspace, loading: wsLoading } = useCurrentWorkspace();
  const { revenue, loading: revLoading } = useRevenueSummary();
  const { campaigns: revCampaigns, loading: revCampLoading } = useRevenueByCampaign();
  const { profile, loading: profileLoading } = useWorkspaceProfile();
  const { breakdown: leadSourceBreakdown, loading: leadSourceLoading } = useLeadSourceBreakdown();

  const loading = summaryLoading || campaignsLoading || wsLoading || revLoading || revCampLoading || profileLoading;

  if (loading) {
    return <div>Loading dashboard…</div>;
  }

  // Brand-new workspace → show onboarding wizard instead of full dashboard
  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto">
        <OnboardingWizard />
      </div>
    );
  }

  const isDomination = workspace?.plan_key === "domination";

  // Block 15300: Format lead source for display
  const formatLeadSource = (source: string): string => {
    const sourceMap: Record<string, string> = {
      storm_outreach: "Storm Outreach",
      insurance_lead: "Insurance Leads",
      retail_lead: "Retail Leads",
      past_customer: "Past Customers",
      quote_reactivation: "Quote Reactivation",
      website_inquiry: "Website Inquiry",
      referral: "Referral",
      unknown: "Unknown",
    };
    return sourceMap[source] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Top row – core KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Emails Sent (30d)"
          value={stats?.emails_sent ?? 0}
        />
        <KpiCard
          label="Replies (30d)"
          value={stats?.replies_received ?? 0}
        />
        <KpiCard
          label="Hot Leads"
          value={stats?.hot_leads ?? 0}
        />
        <KpiCard
          label="Booked / Won"
          value={(stats?.booked_leads ?? 0) + (stats?.won_leads ?? 0)}
        />
      </div>

      {/* Secondary row – pipeline + notes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Warm Leads"
          value={stats?.warm_leads ?? 0}
        />
        <KpiCard
          label="Pipeline Updates (30d)"
          value={stats?.pipeline_events ?? 0}
        />
        <KpiCard
          label="Notes Logged (30d)"
          value={stats?.notes_created ?? 0}
        />
        {/* Placeholder for Revenue – to wire into Stripe later */}
        <KpiCard
          label="Est. Job Value"
          value="$0"
          hint="Wire to revenue later"
        />
      </div>

      {/* Revenue KPIs (Domination Only) - Block 14400 */}
      {isDomination && revenue && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Won Revenue (30d)"
            value={`$${(revenue.won_revenue ?? 0).toLocaleString()}`}
          />
          <KpiCard
            label="Jobs Won (30d)"
            value={revenue.won_count ?? 0}
          />
          <KpiCard
            label="Hot Pipeline"
            value={`$${(revenue.hot_pipeline ?? 0).toLocaleString()}`}
          />
          <KpiCard
            label="Warm Pipeline"
            value={`$${(revenue.warm_pipeline ?? 0).toLocaleString()}`}
          />
        </div>
      )}

      {/* Block 22192: Pipeline Win Forecast */}
      {workspace && (
        <PipelineWinForecast workspaceId={workspace.id} />
      )}

      {/* Locked Revenue Banner (Non-Domination) */}
      {!isDomination && (
        <div className="border rounded-2xl p-4 bg-slate-50">
          <div className="text-sm font-semibold mb-1">
            Revenue Dashboard (Domination)
          </div>
          <div className="text-xs text-gray-600 mb-2">
            Track how much revenue SmartSend helps you close, and which campaigns
            bring in the biggest jobs. Unlock this with the Domination plan.
          </div>
          <a
            href="/billing"
            className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-xl border bg-white"
          >
            Upgrade to Domination
          </a>
        </div>
      )}

      {/* Block 15300: Lead Source Breakdown Widget */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Lead Sources This Month</h2>
          <Link
            href="/pipeline"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            View all →
          </Link>
        </div>
        {leadSourceLoading ? (
          <div className="text-xs text-gray-500 py-4">Loading...</div>
        ) : leadSourceBreakdown.length === 0 ? (
          <div className="text-xs text-gray-500 py-4">
            No lead sources tracked yet. Contacts will be auto-tagged as you add them.
          </div>
        ) : (
          <div className="space-y-2">
            {leadSourceBreakdown.map((item) => {
              const sourceLabel = formatLeadSource(item.source);
              return (
                <Link
                  key={item.source}
                  href={`/pipeline?source=${item.source}`}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm">{sourceLabel}</span>
                  <span className="text-sm font-semibold">{item.count}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Campaign performance table */}
      <div className="bg-white border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Campaign Performance (30d)</h2>
          <span className="text-xs text-gray-500">By replies & bounces</span>
        </div>
        <div className="overflow-x-auto text-sm">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-2">Campaign</th>
                <th className="py-2 pr-2">Emails Sent</th>
                <th className="py-2 pr-2">Replies</th>
                <th className="py-2 pr-2">Bounce</th>
                <th className="py-2 pr-2">Reply Rate</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const replyRate =
                  c.emails_sent > 0
                    ? `${Math.round((c.replies / c.emails_sent) * 100)}%`
                    : "—";
                return (
                  <tr key={c.campaign_id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {c.campaign_name || "Uncategorized"}
                    </td>
                    <td className="py-2 pr-2">{c.emails_sent}</td>
                    <td className="py-2 pr-2">{c.replies}</td>
                    <td className="py-2 pr-2">{c.bounces}</td>
                    <td className="py-2 pr-2">{replyRate}</td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && (
                <tr>
                  <td className="py-4 text-gray-500 text-xs" colSpan={5}>
                    No campaign activity in the last 30 days yet.
                  </td>
                </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>

      {/* Revenue by Campaign Table (Domination Only) - Block 14400 */}
      {isDomination && (
        <div className="bg-white border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Campaign Revenue</h2>
            <span className="text-xs text-gray-500">
              Based on contacts marked WON with job value.
            </span>
          </div>
          <div className="overflow-x-auto text-sm">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-2">Campaign</th>
                  <th className="py-2 pr-2">Contacts</th>
                  <th className="py-2 pr-2">Hot</th>
                  <th className="py-2 pr-2">Won</th>
                  <th className="py-2 pr-2">Pipeline $</th>
                  <th className="py-2 pr-2">Won Revenue $</th>
                </tr>
              </thead>
              <tbody>
                {revCampaigns.map((c: any) => (
                  <tr key={c.campaign_id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {c.campaign_name || "Unknown campaign"}
                    </td>
                    <td className="py-2 pr-2">{c.total_contacts}</td>
                    <td className="py-2 pr-2">{c.hot_leads}</td>
                    <td className="py-2 pr-2">{c.won_leads}</td>
                    <td className="py-2 pr-2">
                      ${Number(c.pipeline_estimate || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-2">
                      ${Number(c.won_revenue || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {revCampaigns.length === 0 && (
                  <tr>
                    <td className="py-4 text-gray-500 text-xs" colSpan={6}>
                      No revenue tracked yet. Mark jobs as WON on contacts to see
                      campaign revenue here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

