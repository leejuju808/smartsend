"use client";

import * as React from "react";
import {
  getCampaignConversationsStarted,
  getCampaignLeadStatusCounts,
  getCampaignReplyStats,
  type CampaignLeadStatusCounts,
  type CampaignReplyStats,
} from "@/app/api/campaign/[id]/reply-stats/actions";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, MailCheck, CalendarCheck2, MessageCircle, XCircle, InboxX } from "lucide-react";

interface CampaignReplyStatsProps {
  campaignId: string;
}

function StatBox({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  accent?: "green" | "blue" | "amber" | "red" | "slate";
}) {
  const colorClass =
    accent === "green"
      ? "text-emerald-500"
      : accent === "blue"
      ? "text-blue-500"
      : accent === "amber"
      ? "text-amber-500"
      : accent === "red"
      ? "text-red-500"
      : accent === "slate"
      ? "text-slate-500"
      : "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", colorClass)} />
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function CampaignReplyStatsStrip({ campaignId }: CampaignReplyStatsProps) {
  const [stats, setStats] = React.useState<CampaignReplyStats | null>(null);
  const [leadCounts, setLeadCounts] = React.useState<CampaignLeadStatusCounts | null>(null);
  const [conversationsStarted, setConversationsStarted] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [data, counts] = await Promise.all([
          getCampaignReplyStats(campaignId),
          getCampaignLeadStatusCounts(campaignId),
        ]);
        const convos = await getCampaignConversationsStarted(campaignId);
        if (mounted) {
          setStats(data);
          setLeadCounts(counts);
          setConversationsStarted(convos);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [campaignId]);

  if (!stats && !loading) {
    // no sends yet
    return (
      <Card className="flex items-center justify-between border-dashed bg-muted/40 px-3 py-2">
        <div>
          <p className="text-xs font-medium">Reply analytics</p>
          <p className="text-xs text-muted-foreground">
            No sends yet for this campaign. Launch to start tracking replies.
          </p>
        </div>
        <InboxX className="h-4 w-4 text-muted-foreground" />
      </Card>
    );
  }

  return (
    <Card className="space-y-2 border bg-background px-3 py-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Reply analytics</p>
          <p className="text-[11px] text-muted-foreground">
            AI Reply Brain, rolled up for this campaign.
          </p>
        </div>
        {loading && (
          <span className="inline-flex items-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {stats && (
        <>
          <div className="grid gap-2 sm:grid-cols-5">
            <StatBox
              label="Sends"
              value={stats.total_sends}
              icon={MailCheck}
              accent="slate"
            />
            <StatBox
              label="Replies"
              value={stats.total_replied}
              icon={MessageCircle}
              accent="blue"
            />
            <StatBox
              label="Conversations"
              value={conversationsStarted ?? 0}
              icon={MessageCircle}
              accent="amber"
            />
            <StatBox
              label="Meetings"
              value={stats.meeting_replies}
              icon={CalendarCheck2}
              accent="green"
            />
            <StatBox
              label="Unsubscribes"
              value={stats.unsubscribe_replies}
              icon={XCircle}
              accent="red"
            />
          </div>

          {leadCounts && (
            <div className="grid gap-2 sm:grid-cols-3">
              <StatBox label="Hot Leads" value={leadCounts.hot} icon={MessageCircle} accent="red" />
              <StatBox label="Warm Leads" value={leadCounts.warm} icon={MessageCircle} accent="amber" />
              <StatBox label="Dead Leads" value={leadCounts.dead} icon={XCircle} accent="slate" />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <StatBox
              label="Positive (no meeting)"
              value={stats.positive_no_meeting_replies}
              icon={MessageCircle}
              accent="green"
            />
            <StatBox
              label="Questions"
              value={stats.neutral_question_replies}
              icon={MessageCircle}
              accent="blue"
            />
            <StatBox
              label="Bounces"
              value={stats.bounce_replies}
              icon={XCircle}
              accent="slate"
            />
          </div>

          {stats.last_reply_at && (
            <p className="text-[11px] text-muted-foreground">
              Last reply: {new Date(stats.last_reply_at).toLocaleString()}
            </p>
          )}
        </>
      )}
    </Card>
  );
}













