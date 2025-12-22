// app/dashboard/campaigns/_components/CampaignDetailClient.tsx
"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState, useTransition, useEffect } from "react";

type LeadStatus = "new" | "in_progress" | "won" | "lost";

type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_at: string;
};

type CampaignPerfRow = {
  campaign_id: string;
  workspace_id: string;
  campaign_name: string;
  campaign_status: string;
  campaign_created_at: string;
  replies_count: number;
  leads_count: number;
  pipeline_value: string;
  won_value: string;
} | null;

type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  status: LeadStatus;
  estimated_value: number | null;
  currency: string;
  created_at: string;
};

type IntentType = "hot" | "warm" | "not_interested" | "unclassified";

type ReplyRow = {
  id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
  intent: IntentType | null;
  confidence: number | null;
};

interface Props {
  campaign: Campaign;
  stats: CampaignPerfRow;
  leads: LeadRow[];
  replies: ReplyRow[];
}

function formatTimeAgo(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

function parseValue(value: string | null | undefined): number {
  if (!value) return 0;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

function formatCurrency(value: number, currency = "USD"): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide";
  if (status === "active") {
    return `${base} border-emerald-600 bg-emerald-500/10 text-emerald-700`;
  }
  if (status === "paused") {
    return `${base} border-yellow-500 bg-yellow-500/10 text-yellow-700`;
  }
  if (status === "archived") {
    return `${base} border-gray-500 bg-gray-500/10 text-gray-400`;
  }
  return `${base} border-blue-600 bg-blue-500/10 text-blue-700`;
}

function leadStatusBadge(status: LeadStatus) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium";
  const map: Record<LeadStatus, string> = {
    new: "border-blue-600 bg-blue-500/10 text-blue-700",
    in_progress: "border-yellow-500 bg-yellow-500/10 text-yellow-700",
    won: "border-emerald-600 bg-emerald-500/10 text-emerald-700",
    lost: "border-gray-500 bg-gray-500/10 text-gray-400",
  };

  const labelMap: Record<LeadStatus, string> = {
    new: "New",
    in_progress: "In progress",
    won: "Won",
    lost: "Lost",
  };

  return (
    <span className={`${base} ${map[status]}`}>{labelMap[status]}</span>
  );
}

function intentChip(intent: IntentType | null) {
  if (!intent || intent === "unclassified") {
    return (
      <span className="rounded-full border border-blue-600 bg-blue-500/10 px-2 py-[2px] text-[9px] font-medium text-blue-600">
        Unclassified
      </span>
    );
  }

  const cfg: Record<
    Exclude<IntentType, "unclassified">,
    { label: string; cls: string }
  > = {
    hot: {
      label: "Hot",
      cls: "border-red-600 bg-red-500/10 text-red-600",
    },
    warm: {
      label: "Warm",
      cls: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
    },
    not_interested: {
      label: "Not interested",
      cls: "border-gray-500 bg-gray-500/10 text-gray-400",
    },
  };

  const cfgItem = cfg[intent as Exclude<IntentType, "unclassified">];

  return (
    <span
      className={`rounded-full border px-2 py-[2px] text-[9px] font-medium ${cfgItem.cls}`}
    >
      {cfgItem.label}
    </span>
  );
}

export default function CampaignDetailClient({
  campaign,
  stats,
  leads,
  replies,
}: Props) {
  const [isStarting, startTransition] = useTransition();
  const [lastQueuedCount, setLastQueuedCount] = useState<number | null>(null);
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");
  const [campaignKpis, setCampaignKpis] = useState<any>(null);
  
  const pipeline =
    stats != null ? parseValue(stats.pipeline_value) : 0;
  const won = stats != null ? parseValue(stats.won_value) : 0;
  const repliesCount = stats?.replies_count ?? replies.length;
  const leadsCount = stats?.leads_count ?? leads.length;

  // Load Block 8990 campaign KPIs
  useEffect(() => {
    async function loadKpis() {
      try {
        const res = await fetch(`/api/dashboard/campaigns?range=${range}`);
        if (res.ok) {
          const json = await res.json();
          const campaignData = json.campaigns?.find(
            (c: any) => c.campaign_id === campaign.id
          );
          setCampaignKpis(campaignData);
        }
      } catch (error) {
        console.error("Error loading campaign KPIs:", error);
      }
    }
    loadKpis();
  }, [campaign.id, range]);

  async function startCampaign() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/campaigns/schedule-initial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
        });

        if (res.status === 402) {
          const json = await res.json();
          if (json.error === "email_cap_reached") {
            // Redirect to billing page
            window.location.href = "/dashboard/billing";
            return;
          }
        }

        if (!res.ok) {
          console.error("Failed to schedule initial sends", await res.text());
          return;
        }

        const json = await res.json();
        setLastQueuedCount(json.queued ?? 0);
      } catch (err) {
        console.error("Error starting campaign", err);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Block 8990: Campaign KPI Row */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Campaign Performance</h2>
          <div className="flex gap-2">
            {(["7d", "30d", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                  range === r
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {r === "7d" ? "7d" : r === "30d" ? "30d" : "All"}
              </button>
            ))}
          </div>
        </div>
        {campaignKpis && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="rounded-xl border bg-background px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Emails Sent</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {campaignKpis.emails_sent ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-background px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Replies</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {campaignKpis.replies_received ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-background px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Hot Leads</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {campaignKpis.hot_leads ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-background px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Jobs Won</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {campaignKpis.jobs_won ?? 0}
              </p>
            </div>
            <div className="rounded-xl border bg-background px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Est. Revenue</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {formatCurrency(campaignKpis.estimated_revenue_won ?? 0)}
              </p>
            </div>
          </div>
        )}
        {campaignKpis && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            This campaign has generated {campaignKpis.hot_leads ?? 0} hot leads and{" "}
            {campaignKpis.jobs_won ?? 0} jobs worth an estimated{" "}
            {formatCurrency(campaignKpis.estimated_revenue_won ?? 0)}.
          </p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
        {/* Left column: overview + leads */}
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
          <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {campaign.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Created {formatTimeAgo(campaign.created_at)}
            </p>
            <Link
              href={`/dashboard/campaigns/${campaign.id}/sequence`}
              className="mt-1 text-[11px] font-medium underline-offset-2 hover:underline"
            >
              Edit sequence →
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startCampaign}
              disabled={isStarting}
              className="rounded-full bg-primary px-4 py-[6px] text-[11px] font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStarting ? "Queuing…" : "Start sending"}
            </button>
            {lastQueuedCount != null && (
              <span className="text-[10px] text-muted-foreground">
                Queued {lastQueuedCount} email
                {lastQueuedCount === 1 ? "" : "s"}.
              </span>
            )}
            <span className={statusBadge(campaign.status)}>
              {campaign.status}
            </span>
          </div>
        </header>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Replies</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {repliesCount}
            </p>
          </div>
          <div className="rounded-xl border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Leads</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {leadsCount}
            </p>
          </div>
          <div className="rounded-xl border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Won value</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-600">
              {formatCurrency(won)}
            </p>
          </div>
        </div>

        {/* Pipeline value */}
        <div className="rounded-xl border bg-background px-3 py-3 text-xs">
          <p className="text-[11px] text-muted-foreground">
            Pipeline value (new + in-progress + won)
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatCurrency(pipeline)}
          </p>
        </div>

        {/* Leads table */}
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Leads from this campaign</h2>
            <Link
              href="/dashboard/leads"
              className="text-[11px] font-medium underline-offset-2 hover:underline"
            >
              View all leads →
            </Link>
          </div>

          {leads.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No leads yet. When you click <span className="font-semibold">"Create Lead"</span> on replies from this campaign, they'll show up here.
            </p>
          ) : (
            <div className="divide-y rounded-xl border bg-background">
              {leads.map((lead) => {
                const value =
                  lead.estimated_value != null
                    ? formatCurrency(lead.estimated_value, lead.currency)
                    : "—";

                const nameOrEmail =
                  lead.name || lead.email || "Unknown contact";

                return (
                  <article
                    key={lead.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/50"
                  >
                    <div className="flex flex-col gap-[2px]">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {nameOrEmail}
                      </Link>
                      {lead.subject && (
                        <span className="line-clamp-1 text-[11px] text-muted-foreground">
                          {lead.subject}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        Created {formatTimeAgo(lead.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-[2px]">
                      {leadStatusBadge(lead.status)}
                      <span className="text-[11px] text-foreground">
                        {value}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Right column: replies */}
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent replies</h2>
          <Link
            href="/dashboard/replies"
            className="text-[11px] font-medium underline-offset-2 hover:underline"
          >
            View all replies →
          </Link>
        </div>

        {replies.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No replies yet for this campaign.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {replies.map((reply) => {
              const nameOrEmail =
                reply.from_name || reply.from_email || "Unknown sender";

              const conf =
                typeof reply.confidence === "number"
                  ? `${Math.round(reply.confidence * 100)}%`
                  : "—";

              return (
                <article
                  key={reply.id}
                  className="rounded-xl border bg-background px-3 py-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-[2px]">
                      <span className="font-medium">{nameOrEmail}</span>
                      {reply.from_email && (
                        <span className="text-[10px] text-muted-foreground">
                          {reply.from_email}
                        </span>
                      )}
                      {reply.subject && (
                        <span className="mt-[2px] text-[11px]">
                          {reply.subject}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-[2px]">
                      {intentChip(reply.intent)}
                      {reply.received_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(reply.received_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  {reply.preview && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {reply.preview}
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>AI confidence: {conf}</span>
                    <Link
                      href="/dashboard/replies"
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      Open in Replies →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

