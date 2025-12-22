// app/campaigns/[id]/review/page.tsx
// Block 15700 — Campaign Review & Send Flow v1
// "3…2…1… Launch My Roofing Campaign"

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Step {
  id: string;
  step_order: number;
  subject_template: string;
  body_template: string;
  delay_days: number;
  ab_test_enabled?: boolean;
  subject_variant_a?: string | null;
  subject_variant_b?: string | null;
}

interface PreviewContact {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  city?: string | null;
}

interface Preview {
  contact: PreviewContact;
  subject: string;
  body: string;
}

interface StepPreview {
  step_id: string;
  step_order: number;
  previews: Preview[];
}

interface ReviewData {
  campaign: {
    id: string;
    name: string;
    template_key?: string | null;
    workspace_id?: string;
    scheduled_for?: string | null;
    status: string;
    steps: Step[];
  };
  contactCount: number;
  previews: StepPreview[];
}

export default function CampaignReviewPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [stats, setStats] = useState<any | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/review`);
        if (!res.ok) {
          throw new Error("Failed to load review data");
        }
        const json = await res.json();
        setData(json);

        // Log reviewed activity (Block 15700)
        await fetch(`/api/campaigns/${campaignId}/activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_type: "reviewed" }),
        }).catch(() => {
          // Ignore activity logging errors
        });
      } catch (e: any) {
        setError(e.message || "Failed to load review");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  // Load campaign performance stats (Block 16900)
  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/stats`);
        if (res.ok) {
          const json = await res.json();
          setStats(json);
        }
      } catch (e: any) {
        console.error("Failed to load stats:", e);
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, [campaignId]);

  async function launchCampaign() {
    setLaunching(true);
    try {
      // Launch campaign
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch" }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Failed to launch city outreach");
        setLaunching(false);
        return;
      }

      router.push(`/campaigns/${campaignId}?launched=1`);
    } catch (e: any) {
      alert("Error launching city outreach: " + e.message);
      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto"></div>
          <p className="text-gray-600 mt-4 text-xs">Loading city outreach review...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-900 mb-2">Error</h2>
          <p className="text-[11px] text-red-700">{error || "Failed to load review"}</p>
          <Link
            href={`/campaigns/${campaignId}`}
            className="mt-3 inline-block text-xs text-blue-600 hover:underline"
          >
            ← Back to city outreach
          </Link>
        </div>
      </div>
    );
  }

  const { campaign, previews, contactCount } = data;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Review city outreach</h1>
        <p className="text-xs text-gray-600 mt-1">
          Double-check everything before SmartSend starts reaching homeowners.
        </p>
      </div>

      {/* Summary Card */}
      <div className="border rounded-2xl p-4 bg-white">
        <div className="text-sm font-semibold">{campaign.name}</div>
        <div className="text-[11px] text-gray-600 mt-1">
          {contactCount.toLocaleString()} {contactCount === 1 ? "homeowner" : "homeowners"} selected
        </div>

        <div className="mt-3">
          <div className="text-xs font-semibold mb-1">Steps:</div>
          <div className="space-y-2">
            {campaign.steps
              .sort((a, b) => a.step_order - b.step_order)
              .map((step) => (
                <div key={step.id} className="border rounded-xl p-3 bg-slate-50">
                  <div className="text-xs font-semibold">
                    Step {step.step_order}
                  </div>
                  <div className="text-[11px] mt-1">
                    <span className="font-semibold">Subject:</span>{" "}
                    {step.subject_template}
                  </div>
                  {step.ab_test_enabled && (
                    <div className="text-[11px] mt-1">
                      <span className="font-semibold">A/B Enabled →</span>
                      <div className="ml-2 mt-1">
                        <div>A: {step.subject_variant_a}</div>
                        <div>B: {step.subject_variant_b}</div>
                      </div>
                    </div>
                  )}
                  <div className="text-[11px] mt-1">
                    <span className="font-semibold">Delay:</span> {step.delay_days} {step.delay_days === 1 ? "day" : "days"}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div>
        <div className="text-sm font-semibold">Personalized Previews</div>
        <div className="text-[11px] text-gray-600 mt-1">
          Random samples of what homeowners will actually see.
        </div>

        <div className="mt-3 space-y-4">
          {previews.map((stepPreview) => (
            <div key={stepPreview.step_id} className="border rounded-2xl p-4 bg-white">
              <div className="text-xs font-semibold mb-2">
                Step {stepPreview.step_order}
              </div>

              {stepPreview.previews.map((p, idx) => (
                <div key={idx} className="border rounded-xl p-3 bg-slate-50 mb-2">
                  <div className="text-[11px] font-semibold">
                    To: {p.contact.first_name || p.contact.email}
                  </div>
                  <div className="text-[11px] mt-1">
                    <span className="font-semibold">Subject:</span> {p.subject}
                  </div>
                  <div className="text-[11px] mt-1 whitespace-pre-line text-gray-700">
                    {p.body}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Performance Panel (Block 16900) */}
      <div className="border rounded-2xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-semibold">Performance</div>
            <div className="text-[11px] text-gray-600">
              How this city outreach is performing with homeowners.
            </div>
          </div>
        </div>

        {statsLoading && (
          <div className="text-[11px] text-gray-500">Loading stats…</div>
        )}

        {!statsLoading && stats && (
          <>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <MetricCard
                label="Homeowners contacted"
                value={stats.stats.sent}
              />
              <MetricCard
                label="Homeowners responding"
                value={`${stats.stats.replies} (${Math.round(stats.stats.replyRate * 100)}%)`}
              />
              <MetricCard
                label="Hot leads"
                value={`${stats.stats.hotLeads} (${Math.round(
                  stats.stats.hotRate * 100
                )}%)`}
              />
              <MetricCard
                label="Warm leads"
                value={stats.stats.warmLeads}
              />
            </div>

            <div className="mt-4 border-t pt-3 flex items-center justify-between text-[11px]">
              <div className="text-gray-600">
                Est. pipeline value touched by this city outreach
              </div>
              <div className="text-sm font-semibold">
                ${stats.stats.estValue.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>
          </>
        )}

        {!statsLoading && !stats && (
          <div className="text-[11px] text-gray-500">
            No performance data yet. Launch city outreach to see stats.
          </div>
        )}
      </div>

      {/* Launch CTA */}
      <div className="border rounded-2xl p-4 bg-white flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            Ready to launch your city outreach?
          </div>
          <div className="text-[11px] text-gray-600 mt-1">
            SmartSend will contact homeowners immediately and queue follow-ups.
          </div>
        </div>

        <button
          disabled={launching}
          onClick={launchCampaign}
          className="px-4 py-2 text-xs bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {launching ? "Launching…" : "Launch city outreach"}
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded-2xl p-3 bg-slate-50">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}









