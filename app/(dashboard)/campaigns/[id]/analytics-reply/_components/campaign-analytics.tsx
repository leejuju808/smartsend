"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface CampaignAnalyticsProps {
  analytics: {
    campaign_id: string;
    campaign_name: string;
    total_sends: number;
    total_leads_sent: number;
    total_replies: number;
    total_leads_replied: number;
    reply_rate_leads_pct: number;
    intent_positive_count: number;
    intent_neutral_count: number;
    intent_negative_count: number;
    intent_unsubscribe_count: number;
    intent_bounce_count: number;
    intent_spam_count: number;
    intent_referral_count: number;
    intent_out_of_office_count: number;
    intent_wrong_person_count: number;
    intent_not_sure_count: number;
    first_send_at: string | null;
    last_send_at: string | null;
  };
}

export function CampaignAnalytics({ analytics }: CampaignAnalyticsProps) {
  const totalReplies = analytics.total_replies ?? 0;

  const intents = [
    { key: "intent_positive_count", label: "Positive", tone: "good" as const },
    { key: "intent_referral_count", label: "Referral", tone: "good" as const },
    { key: "intent_neutral_count", label: "Neutral", tone: "neutral" as const },
    { key: "intent_negative_count", label: "Negative", tone: "bad" as const },
    { key: "intent_unsubscribe_count", label: "Unsubscribe", tone: "bad" as const },
    { key: "intent_bounce_count", label: "Bounce", tone: "bad" as const },
    { key: "intent_spam_count", label: "Spam", tone: "bad" as const },
    { key: "intent_out_of_office_count", label: "Out of office", tone: "neutral" as const },
    { key: "intent_wrong_person_count", label: "Wrong person", tone: "neutral" as const },
    { key: "intent_not_sure_count", label: "Not sure", tone: "neutral" as const },
  ];

  const intentRows = intents.map((i) => {
    const count = (analytics as any)[i.key] as number;
    const pct =
      totalReplies > 0 ? ((count / totalReplies) * 100).toFixed(1) : "0.0";
    return { ...i, count, pct };
  });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Leads contacted
            </p>
            <p className="text-2xl font-semibold">
              {analytics.total_leads_sent ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {analytics.total_sends ?? 0} sends total
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Leads replied
            </p>
            <p className="text-2xl font-semibold">
              {analytics.total_leads_replied ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {analytics.reply_rate_leads_pct?.toFixed
                ? analytics.reply_rate_leads_pct.toFixed(1)
                : analytics.reply_rate_leads_pct}
              % reply rate
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Total replies
            </p>
            <p className="text-2xl font-semibold">
              {totalReplies}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Includes all replies, not just first response.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Campaign window
            </p>
            <p className="text-sm font-semibold">
              {analytics.first_send_at
                ? new Date(analytics.first_send_at).toLocaleDateString()
                : "—"}{" "}
              –{" "}
              {analytics.last_send_at
                ? new Date(analytics.last_send_at).toLocaleDateString()
                : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              First & last send time.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Intent breakdown */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reply intent breakdown
              </p>
              <p className="text-xs text-muted-foreground">
                How replies for this campaign are distributed across AI intents.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {totalReplies} replies
            </Badge>
          </div>

          <div className="overflow-hidden rounded-xl border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-3 py-2 font-medium">Intent</th>
                  <th className="px-3 py-2 font-medium text-right">Count</th>
                  <th className="px-3 py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {intentRows.map((row) => (
                  <tr key={row.key} className="border-t last:border-b-0">
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2",
                          row.count === 0 && "text-muted-foreground/70"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            row.tone === "good" && "bg-emerald-500",
                            row.tone === "bad" && "bg-red-500",
                            row.tone === "neutral" && "bg-slate-400"
                          )}
                        />
                        {row.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {row.count}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {row.pct}%
                    </td>
                  </tr>
                ))}
                {totalReplies === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                    >
                      No replies yet. Once replies start coming in, you'll see
                      intent analytics here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

