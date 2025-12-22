// app/(app)/dashboard/page.tsx
// Block 8990 — Simple Revenue & Reply Dashboard v1
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OnboardingBanner } from "@/components/dashboard/OnboardingBanner";
import { PlanUsageCard } from "@/components/dashboard/PlanUsageCard";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { TopLeadsTodayWidget } from "@/components/dashboard/TopLeadsTodayWidget";

type RangeKey = "7d" | "30d" | "all";

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [summaryData, setSummaryData] = useState<any>(null);
  const [campaignsData, setCampaignsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryRes, campaignsRes] = await Promise.all([
          fetch(`/api/dashboard/summary?range=${range}`),
          fetch(`/api/dashboard/campaigns?range=${range}`),
        ]);
        
        if (summaryRes.ok) {
          const summaryJson = await summaryRes.json();
          setSummaryData(summaryJson);
        }
        
        if (campaignsRes.ok) {
          const campaignsJson = await campaignsRes.json();
          setCampaignsData(campaignsJson.campaigns || []);
        }
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [range]);

  if (loading || !summaryData) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <OnboardingBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-xs text-gray-600 mt-1">
            See how many roofing jobs SmartSend generated this month.
          </p>
        </div>
        {/* Time Range Selector */}
        <div className="flex gap-2">
          {(["7d", "30d", "all"] as RangeKey[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                range === r
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "All time"}
            </button>
          ))}
        </div>
      </div>

      {/* Block 11500: Estimated Job Value - BIG NUMBER */}
      {summaryData.estimated_job_value !== undefined && (
        <div className="border-2 border-emerald-500 rounded-2xl p-6 bg-gradient-to-br from-emerald-50 to-white">
          <div className="text-sm text-gray-600 mb-1">Estimated Job Value</div>
          <div className="text-4xl font-bold text-emerald-600">
            ${Number(summaryData.estimated_job_value || 0).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Potential revenue from SmartSend leads • Updated automatically
          </div>
        </div>
      )}

      {/* Top KPI Row - Block 8990 */}
      <div className="grid md:grid-cols-5 gap-3">
        <KpiCard
          label="🧾 Emails Sent"
          value={summaryData.emails_sent ?? 0}
          hint={`in ${range}`}
        />
        <KpiCard
          label="💬 Replies Received"
          value={summaryData.replies_received ?? 0}
          hint={`in ${range}`}
        />
        <KpiCard
          label="🔥 Hot Leads"
          value={summaryData.hot_leads ?? 0}
          hint={`in ${range}`}
        />
        <KpiCard
          label="🏆 Jobs Won"
          value={summaryData.jobs_won ?? 0}
          hint={`in ${range}`}
        />
        <KpiCard
          label="💰 Est. Revenue (Won)"
          value={`$${Number(summaryData.estimated_revenue_won || 0).toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
          hint={`in ${range}`}
        />
      </div>

      {/* Campaign Performance Table */}
      <CampaignPerformanceTable campaigns={campaignsData} />

      {/* Pipeline & Plan usage */}
      <div className="grid md:grid-cols-2 gap-3">
        <PipelineSnapshot pipeline={pipeline} />
        <PlanUsageCard />
      </div>

      {/* Latest hot/warm leads */}
      <div className="grid md:grid-cols-2 gap-3">
        <HotWarmList contacts={hotWarmContacts} />
        <TodayTasks tasks={tasksToday} />
      </div>

      {/* Block 8850: Top Leads Today */}
      <TopLeadsTodayWidget />

      {/* Top Campaigns (Block 16900) */}
      <TopCampaignsCard />
    </div>
  );
}

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
    <div className="border rounded-2xl p-3 bg-white">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {hint && (
        <div className="text-[10px] text-gray-500 mt-1">{hint}</div>
      )}
    </div>
  );
}

function PipelineSnapshot({ pipeline }: { pipeline: any }) {
  const stages = pipeline.stages || [];
  const totals = pipeline.totals || {};

  return (
    <div className="border rounded-2xl p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Pipeline</div>
        <Link href="/pipeline" className="text-[10px] text-blue-600">
          View board
        </Link>
      </div>
      <div className="space-y-1">
        {stages.map((s: any) => {
          const total = totals[s.id]?.total || 0;
          if (total === 0 && !["hot", "won"].includes(s.key)) return null;
          return (
            <div
              key={s.id}
              className="flex items-center justify-between text-[11px]"
            >
              <span>{s.label}</span>
              <span className="font-semibold">
                ${Number(total).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          );
        })}
        {stages.length === 0 && (
          <div className="text-[11px] text-gray-500">
            No pipeline stages configured yet.
          </div>
        )}
      </div>
    </div>
  );
}

function HotWarmList({ contacts }: { contacts: any[] }) {
  return (
    <div className="border rounded-2xl p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Latest hot & warm leads</div>
        <Link href="/pipeline" className="text-[10px] text-blue-600">
          See in pipeline
        </Link>
      </div>
      {(!contacts || contacts.length === 0) && (
        <div className="text-[11px] text-gray-500">
          No hot or warm leads yet in the last 7 days.
        </div>
      )}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {contacts?.map((c) => (
          <Link
            key={c.id}
            href={`/contacts/${c.id}`}
            className="block border rounded-xl p-2 bg-slate-50 hover:bg-slate-100"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">
                {c.first_name || c.last_name
                  ? `${c.first_name || ""} ${c.last_name || ""}`
                  : c.email}
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${
                  c.lead_status === "hot"
                    ? "bg-red-500 text-white"
                    : "bg-orange-400 text-white"
                }`}
              >
                {c.lead_status}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {c.city && `${c.city} · `}
              Est: $
              {Number(c.est_job_value || 0).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TodayTasks({ tasks }: { tasks: any[] }) {
  return (
    <div className="border rounded-2xl p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Follow-ups today</div>
        <Link href="/tasks" className="text-[10px] text-blue-600">
          View all
        </Link>
      </div>
      {(!tasks || tasks.length === 0) && (
        <div className="text-[11px] text-gray-500">
          No open tasks due today.
        </div>
      )}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {tasks?.map((t) => (
          <Link
            key={t.id}
            href={
              t.contact_id ? `/contacts/${t.contact_id}` : "/tasks"
            }
            className="block border rounded-xl p-2 bg-slate-50 hover:bg-slate-100"
          >
            <div className="text-xs font-semibold">{t.title}</div>
            {t.contacts && (
              <div className="text-[10px] text-gray-500">
                {t.contacts.first_name || t.contacts.last_name
                  ? `${t.contacts.first_name || ""} ${
                      t.contacts.last_name || ""
                    }`
                  : t.contacts.email}
                {t.contacts.city && ` · ${t.contacts.city}`}
              </div>
            )}
            {t.due_at && (
              <div className="text-[10px] text-gray-500">
                Due at{" "}
                {new Date(t.due_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// Campaign Performance Table - Block 8990
function CampaignPerformanceTable({ campaigns }: { campaigns: any[] }) {
  if (campaigns.length === 0) {
    return (
      <div className="border rounded-2xl p-4 bg-white">
        <div className="text-sm font-semibold mb-2">Campaign Performance</div>
        <div className="text-[11px] text-gray-500">No campaign activity yet.</div>
      </div>
    );
  }

  return (
    <div className="border rounded-2xl p-4 bg-white overflow-x-auto">
      <div className="text-sm font-semibold mb-3">Campaign Performance</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-gray-600">
            <th className="text-left py-2 px-2">Campaign Name</th>
            <th className="text-right py-2 px-2">Emails Sent</th>
            <th className="text-right py-2 px-2">Replies</th>
            <th className="text-right py-2 px-2">Positive Replies</th>
            <th className="text-right py-2 px-2">Hot Leads</th>
            <th className="text-right py-2 px-2">Jobs Won</th>
            <th className="text-right py-2 px-2">Est. Revenue (Won)</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr
              key={c.campaign_id}
              className="border-b hover:bg-gray-50 cursor-pointer"
              onClick={() => (window.location.href = `/campaigns/${c.campaign_id}`)}
            >
              <td className="py-2 px-2 font-medium">{c.name || "Untitled"}</td>
              <td className="text-right py-2 px-2">{c.emails_sent ?? 0}</td>
              <td className="text-right py-2 px-2">{c.replies_received ?? 0}</td>
              <td className="text-right py-2 px-2">{c.positive_replies ?? 0}</td>
              <td className="text-right py-2 px-2">{c.hot_leads ?? 0}</td>
              <td className="text-right py-2 px-2">{c.jobs_won ?? 0}</td>
              <td className="text-right py-2 px-2 font-semibold">
                ${Number(c.estimated_revenue_won || 0).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

