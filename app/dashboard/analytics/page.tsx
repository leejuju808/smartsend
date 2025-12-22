"use client";

import { useMemo, useState } from "react";
import { BillingStatusNudge } from "@/components/billing/BillingStatusNudge";
import { SendCapNudge } from "@/components/billing/SendCapNudge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaignOutcomes } from "@/lib/hooks/useCampaignOutcomes";
import { useInboxReplies } from "@/lib/hooks/useInboxReplies";
import type { InboxFilterState } from "@/components/inbox/InboxFilters";
import { ReplyIntentBadges } from "@/components/inbox/ReplyIntentBadges";
import { ReplyDetailSheet } from "@/components/inbox/ReplyDetailSheet";

export default function AnalyticsOverviewPage() {
  // 1) Load campaign outcomes
  const {
    outcomes,
    loading: loadingOutcomes,
    reload: reloadOutcomes,
  } = useCampaignOutcomes();

  // 2) Load meeting-intent replies (for recent activity list)
  const inboxFilters: InboxFilterState = {
    category: "all",
    hasMeetingOnly: true,
    stopFollowupsOnly: false,
    search: "",
  };
  const {
    data: meetingData,
    loading: loadingMeetings,
    reload: reloadMeetings,
  } = useInboxReplies(inboxFilters);
  const meetingReplies = meetingData?.replies || [];

  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleReplyClick = (id: string) => {
    setSelectedReplyId(id);
    setDetailOpen(true);
  };

  const handleRefresh = () => {
    reloadOutcomes();
    reloadMeetings();
  };

  // 🔢 Global metrics from campaign outcomes
  const globalMetrics = useMemo(() => {
    let totalSent = 0;
    let totalReplies = 0;
    let totalMeetings = 0;
    let totalClosedWonCents = 0;

    for (const o of outcomes) {
      totalSent += o.total_sent ?? 0;
      totalReplies += o.total_replies ?? 0;
      totalMeetings += o.total_meetings ?? 0;
      totalClosedWonCents += o.closed_won_value_cents ?? 0;
    }

    const replyRate =
      totalSent > 0 ? totalReplies / totalSent : 0;
    const meetingRate =
      totalSent > 0 ? totalMeetings / totalSent : 0;

    const closedWonUsd = totalClosedWonCents / 100;

    const formatPercent = (v: number) =>
      (v * 100).toLocaleString(undefined, {
        maximumFractionDigits: 1,
      }) + "%";

    const formatMoney = (v: number) =>
      v.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });

    return {
      totalSent,
      totalReplies,
      totalMeetings,
      replyRateLabel:
        totalSent > 0 ? formatPercent(replyRate) : "—",
      meetingRateLabel:
        totalSent > 0 ? formatPercent(meetingRate) : "—",
      closedWonLabel: closedWonUsd > 0 ? formatMoney(closedWonUsd) : "$0",
    };
  }, [outcomes]);

  // 🏆 Top campaigns by revenue per 1k sends
  const topCampaigns = useMemo(() => {
    type Row = {
      campaign_id: string;
      sent: number;
      replies: number;
      meetings: number;
      closedWonCents: number;
      revPerThousand: number;
    };

    const rows: Row[] = outcomes.map((o) => {
      const sent = o.total_sent ?? 0;
      const replies = o.total_replies ?? 0;
      const meetings = o.total_meetings ?? 0;
      const closedWonCents = o.closed_won_value_cents ?? 0;
      const revPerThousand =
        sent > 0 ? (closedWonCents / 100 / sent) * 1000 : 0;

      return {
        campaign_id: o.campaign_id,
        sent,
        replies,
        meetings,
        closedWonCents,
        revPerThousand,
      };
    });

    rows.sort((a, b) => b.revPerThousand - a.revPerThousand);

    return rows.slice(0, 5); // top 5
  }, [outcomes]);

  const formatMoney = (v: number) =>
    v.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const formatPercent = (v: number) =>
    (v * 100).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    }) + "%";

  const formatRevPerThousand = (revPerThousand: number) =>
    revPerThousand > 0 ? formatMoney(revPerThousand) : "—";

  return (
    <>
      <div className="p-6 space-y-4">
        {/* Billing guardrails */}
        <BillingStatusNudge />
        <SendCapNudge />

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">
              Analytics Overview
            </h1>
            <p className="text-xs text-muted-foreground">
              High-level performance across all city outreach, booked meetings, and revenue.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-[11px]"
              onClick={handleRefresh}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Global metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">
                Homeowners contacted (all time)
              </div>
              <div className="mt-1 text-xl font-semibold">
                {globalMetrics.totalSent.toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                From all city outreach in this workspace
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">
                Homeowners responding
              </div>
              <div className="mt-1 text-xl font-semibold">
                {globalMetrics.totalReplies.toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Responding rate: {globalMetrics.replyRateLabel}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">
                Booked
              </div>
              <div className="mt-1 text-xl font-semibold">
                {globalMetrics.totalMeetings.toLocaleString()}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Booked rate: {globalMetrics.meetingRateLabel}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">
                Closed-won revenue
              </div>
              <div className="mt-1 text-xl font-semibold">
                {globalMetrics.closedWonLabel}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Based on deals in Meeting Pipeline
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top campaigns */}
          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold">
                    Top city outreach (by revenue per 1k contacted)
                  </span>
                  <Badge className="bg-slate-900 border-slate-700 text-[10px]">
                    All time
                  </Badge>
                </div>
              </div>

              {loadingOutcomes ? (
                <p className="text-[11px] text-muted-foreground">
                  Loading city outreach outcomes…
                </p>
              ) : topCampaigns.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No city outreach outcome data yet.
                </p>
              ) : (
                <div className="overflow-x-auto text-[11px]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="py-1 pr-2 font-medium">
                          City outreach ID
                        </th>
                        <th className="py-1 pr-2 font-medium text-right">
                          Contacted
                        </th>
                        <th className="py-1 pr-2 font-medium text-right">
                          Booked
                        </th>
                        <th className="py-1 pr-2 font-medium text-right">
                          Closed-won
                        </th>
                        <th className="py-1 pr-2 font-medium text-right">
                          Rev / 1k contacted
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCampaigns.map((row) => (
                        <tr
                          key={row.campaign_id}
                          className="border-b border-slate-900/80 last:border-b-0"
                        >
                          <td className="py-1 pr-2">
                            <span className="text-[11px]">
                              {row.campaign_id.slice(0, 10)}…
                            </span>
                          </td>
                          <td className="py-1 pr-2 text-right">
                            {row.sent.toLocaleString()}
                          </td>
                          <td className="py-1 pr-2 text-right">
                            {row.meetings.toLocaleString()}
                          </td>
                          <td className="py-1 pr-2 text-right">
                            {row.closedWonCents > 0
                              ? formatMoney(row.closedWonCents / 100)
                              : "—"}
                          </td>
                          <td className="py-1 pr-2 text-right">
                            {formatRevPerThousand(row.revPerThousand)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent meeting replies */}
          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold">
                    Recent meeting-intent responses
                  </span>
                  <Badge className="bg-amber-900/80 border-amber-600 text-[10px]">
                    Meeting intent only
                  </Badge>
                </div>
              </div>

              {loadingMeetings ? (
                <p className="text-[11px] text-muted-foreground">
                  Loading meeting responses…
                </p>
              ) : meetingReplies.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No meeting-intent responses yet.
                </p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto text-[11px]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="py-1 pr-2 font-medium">
                          Subject
                        </th>
                        <th className="py-1 pr-2 font-medium">
                          Contact
                        </th>
                        <th className="py-1 pr-2 font-medium">
                          AI intent
                        </th>
                        <th className="py-1 pr-2 font-medium text-right">
                          Received
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {meetingReplies.slice(0, 15).map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-slate-900/80 last:border-b-0 hover:bg-slate-950/70 cursor-pointer"
                          onClick={() => handleReplyClick(r.id)}
                        >
                          <td className="py-1 pr-2 align-top">
                            <div className="font-semibold line-clamp-2">
                              {r.subject || "(no subject)"}
                            </div>
                          </td>
                          <td className="py-1 pr-2 align-top">
                            {r.lead_email || "Unknown"}
                          </td>
                          <td className="py-1 pr-2 align-top">
                            <ReplyIntentBadges
                              aiCategory={r.ai_category}
                              aiHasMeeting={r.ai_has_meeting}
                              aiStopFollowups={r.ai_stop_followups}
                            />
                          </td>
                          <td className="py-1 pr-2 align-top text-right">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(
                                r.received_at
                              ).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Shared Reply Detail drawer */}
      <ReplyDetailSheet
        replyId={selectedReplyId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedReplyId(null);
        }}
      />
    </>
  );
}





