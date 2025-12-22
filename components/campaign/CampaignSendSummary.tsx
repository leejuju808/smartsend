// components/campaign/CampaignSendSummary.tsx
// Block 8140 — Campaign summary stats card

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CampaignSendStats } from "@/lib/smartsend/campaign-send";
import { Circle, MailCheck, AlertTriangle, Clock, MessageCircle } from "lucide-react";

type Props = {
  stats: CampaignSendStats | null;
};

function timeAgoStrict(iso: string) {
  const d = new Date(iso);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return "—";
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function CampaignSendSummary({ stats }: Props) {
  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contacted & Responses</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No contact data yet. Once this city outreach starts running, contact and response stats
          will show up here.
        </CardContent>
      </Card>
    );
  }

  const {
    total_jobs,
    pending_count,
    processing_count,
    retry_count,
    failed_count,
    sent_count,
    replied_count,
    sent_rate,
    failure_rate,
    reply_rate,
    last_sent_at,
    last_replied_at,
  } = stats;

  const sentPct = Math.round((sent_rate ?? 0) * 100);
  const failPct = Math.round((failure_rate ?? 0) * 100);
  const replyPct = Math.round((reply_rate ?? 0) * 100);

  const lastSentLabel = last_sent_at
    ? `${timeAgoStrict(last_sent_at)}`
    : "Not contacted yet";

  const lastReplyLabel = last_replied_at
    ? `${timeAgoStrict(last_replied_at)}`
    : "No responses yet";

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          Contacted & Responses
        </CardTitle>
        <MailCheck className="h-4 w-4 opacity-70" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top row: total + sent rate + reply rate */}
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total queued
            </p>
            <p className="text-2xl font-semibold">{total_jobs}</p>
          </div>

          <div className="text-right space-y-1">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Contact rate
              </p>
              <p className="text-xl font-semibold">{sentPct}%</p>
            </div>
            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5 opacity-80" />
              <span>Homeowners responding: </span>
              <span className="font-semibold text-foreground">{replyPct}%</span>
            </div>
          </div>
        </div>

        {/* Sent progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Contacted</span>
            <span>
              {sent_count} ({sentPct}%)
            </span>
          </div>
          <Progress value={sentPct} />
        </div>

        {/* Replies quick stats */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5 opacity-80" />
            <span>Responses</span>
          </div>
          <div className="text-right">
            <p className="font-semibold text-foreground">
              {replied_count}{" "}
              <span className="text-muted-foreground text-[11px]">
                ({replyPct}% of total)
              </span>
            </p>
          </div>
        </div>

        {/* Status pills */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <StatusPill label="Pending" value={pending_count} icon={Clock} />
          <StatusPill label="Processing" value={processing_count} icon={Circle} />
          <StatusPill label="Retry" value={retry_count} icon={AlertTriangle} />
          <StatusPill label="Failed" value={failed_count} icon={AlertTriangle} />
        </div>

        {/* Footer: failure + last sent + last replied */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3 mt-1">
          <span>Failure rate</span>
          <span>{failPct}%</span>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Last contacted</span>
            <span>{lastSentLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last response</span>
            <span>{lastReplyLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type PillProps = {
  label: string;
  value: number;
  icon?: React.ComponentType<{ className?: string }>;
};

function StatusPill({ label, value, icon: Icon }: PillProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl border px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 opacity-70" /> : null}
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

