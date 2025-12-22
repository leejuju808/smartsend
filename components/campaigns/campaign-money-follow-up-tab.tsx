"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CampaignMoneyFollowUp = {
  campaign_id: string;
  campaign_name: string;
  leads_count: number;
  hot_leads: number;
  warm_leads: number;
  not_interested_leads: number;
  pipeline_value: number;
  booked_value: number;
  initial_sent: number;
  follow_ups_sent: number;
  replies_total: number;
  reply_rate_percent: number;
  hot_from_replies_percent: number;
};

type Props = {
  campaignId: string;
};

export function CampaignMoneyFollowUpTab({ campaignId }: Props) {
  const [data, setData] = React.useState<CampaignMoneyFollowUp | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/money-follow-up`);
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        setData(json.data ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [campaignId]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Money + Follow-Up</CardTitle>
          <CardDescription>Loading campaign stats…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Money + Follow-Up</CardTitle>
          <CardDescription>
            No data yet. Start sending emails in this campaign to see performance.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;

  const {
    campaign_name,
    leads_count,
    hot_leads,
    warm_leads,
    not_interested_leads,
    pipeline_value,
    booked_value,
    initial_sent,
    follow_ups_sent,
    replies_total,
    reply_rate_percent,
    hot_from_replies_percent,
  } = data;

  const totalEmails = initial_sent + follow_ups_sent;

  return (
    <div className="flex flex-col gap-4">
      {/* High-level money row */}
      <Card>
        <CardHeader>
          <CardTitle>{campaign_name}</CardTitle>
          <CardDescription>
            Money + follow-up impact for this campaign.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatBlock
            label="Pipeline value"
            value={currency(pipeline_value)}
            sub={`${leads_count} leads`}
            variant="pipeline"
          />
          <StatBlock
            label="Booked value"
            value={currency(booked_value)}
            sub="From jobs won through this campaign"
            variant="booked"
          />
          <StatBlock
            label="Hot leads"
            value={`${hot_leads}`}
            sub={`${warm_leads} warm · ${not_interested_leads} not interested`}
          />
          <StatBlock
            label="Reply rate"
            value={`${reply_rate_percent.toFixed(1)}%`}
            sub={`${replies_total} replies from ${initial_sent} initial emails`}
          />
        </CardContent>
      </Card>

      {/* Follow-up stats + explainer strip */}
      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Performance</CardTitle>
          <CardDescription>
            How SmartSend followed up and turned replies into opportunities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Initial emails sent</p>
              <p className="text-xl font-semibold">{initial_sent}</p>
              <p className="text-[11px] text-muted-foreground">
                Total emails (incl. follow-ups):{" "}
                <span className="font-medium">{totalEmails}</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Follow-ups sent</p>
              <p className="text-xl font-semibold">{follow_ups_sent}</p>
              <p className="text-[11px] text-muted-foreground">
                Replies: <span className="font-medium">{replies_total}</span> · Hot from replies:{" "}
                <span className="font-medium">
                  {hot_from_replies_percent.toFixed(1)}%
                </span>
              </p>
            </div>
          </div>

          {/* Explainer strip (money story) */}
          <CampaignMoneyExplainerStrip
            followUps={follow_ups_sent}
            initial={initial_sent}
            replies={replies_total}
            hot={hot_leads}
            warm={warm_leads}
          />
        </CardContent>
      </Card>
    </div>
  );
}

type StatBlockProps = {
  label: string;
  value: string;
  sub?: string;
  variant?: "pipeline" | "booked";
};

function StatBlock({ label, value, sub, variant }: StatBlockProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 text-xs",
        variant === "pipeline" &&
          "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200/70 dark:border-yellow-800",
        variant === "booked" &&
          "bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-200/70 dark:border-emerald-800"
      )}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

type ExplainerProps = {
  followUps: number;
  initial: number;
  replies: number;
  hot: number;
  warm: number;
};

function CampaignMoneyExplainerStrip({
  followUps,
  initial,
  replies,
  hot,
  warm,
}: ExplainerProps) {
  const totalOpp = hot + warm;

  if (!initial && !followUps && !replies) {
    return (
      <div className="mt-3 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Once this campaign starts sending, we'll show you how many extra homeowners
        SmartSend follows up with for you — and how many turn into real jobs.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-3 rounded-2xl border bg-gradient-to-r from-amber-50/70 via-yellow-50/70 to-amber-100/70 px-3 py-2.5 text-xs",
        "dark:from-slate-900 dark:via-slate-900 dark:to-amber-900/30 dark:border-amber-900/50"
      )}
    >
      <div className="mt-[3px] flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-[10px] font-semibold text-amber-300 dark:bg-amber-500/20 dark:text-amber-200">
        $
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900 dark:text-amber-100">
          Why this campaign is making you money
        </p>
        <p className="text-[13px] leading-snug text-slate-900 dark:text-amber-50">
          SmartSend has sent{" "}
          <span className="font-semibold">
            {followUps.toLocaleString()} follow-up
            {followUps === 1 ? "" : "s"}
          </span>{" "}
          on top of{" "}
          <span className="font-semibold">
            {initial.toLocaleString()} initial email
            {initial === 1 ? "" : "s"}
          </span>
          , and turned{" "}
          <span className="font-semibold">
            {replies.toLocaleString()} repl
            {replies === 1 ? "y" : "ies"}
          </span>{" "}
          into{" "}
          <span className="font-semibold">
            {totalOpp.toLocaleString()} real opportunity
            {totalOpp === 1 ? "" : "ies"}
          </span>{" "}
          ({hot} hot · {warm} warm).
        </p>
        <p className="text-[11px] text-slate-700/90 dark:text-amber-200/80">
          These are homeowners SmartSend kept alive with automatic follow-ups, so you
          can focus on bids, crews, and installs instead of chasing emails.
        </p>
      </div>
    </div>
  );
}











































