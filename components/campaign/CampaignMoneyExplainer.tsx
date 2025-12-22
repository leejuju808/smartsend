"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type FollowUpStats = {
  initial_sent: number;
  follow_ups_sent: number;
  replies_total: number;
  hot_leads: number;
  warm_leads: number;
  not_interested_leads: number;
  reply_rate: number;
  hot_lead_rate: number;
};

type CampaignMoneyExplainerProps = {
  stats: FollowUpStats | null;
  className?: string;
};

export function CampaignMoneyExplainer({
  stats,
  className,
}: CampaignMoneyExplainerProps) {
  if (!stats) return null;

  const {
    initial_sent,
    follow_ups_sent,
    replies_total,
    hot_leads,
    warm_leads,
  } = stats;

  // Basic safety
  const safeInitial = initial_sent || 0;
  const safeFollowUps = follow_ups_sent || 0;
  const safeReplies = replies_total || 0;
  const safeHot = hot_leads || 0;
  const safeWarm = warm_leads || 0;
  const totalOpportunities = safeHot + safeWarm;

  // If nothing has happened yet, show a gentle nudge instead
  if (safeInitial === 0 && safeFollowUps === 0 && safeReplies === 0) {
    return (
      <div
        className={cn(
          "mt-3 flex items-start gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
          className
        )}
      >
        <Info className="mt-[2px] h-4 w-4" />
        <div>
          <p className="font-medium text-foreground">
            Once this campaign starts sending, we'll show you exactly how many extra
            homeowners SmartSend follows up with for you.
          </p>
          <p className="mt-1">
            Launch your first batch of emails to see how many jobs automation can add
            on top of your normal outreach.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-3 rounded-2xl border bg-gradient-to-r from-amber-50/70 via-yellow-50/70 to-amber-100/70 px-3 py-2.5 text-xs",
        "dark:from-slate-900 dark:via-slate-900 dark:to-amber-900/30 dark:border-amber-900/50",
        className
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
            {safeFollowUps.toLocaleString()} follow-up
            {safeFollowUps === 1 ? "" : "s"}
          </span>{" "}
          on top of{" "}
          <span className="font-semibold">
            {safeInitial.toLocaleString()} initial email
            {safeInitial === 1 ? "" : "s"}
          </span>
          , and turned{" "}
          <span className="font-semibold">
            {safeReplies.toLocaleString()} total repl
            {safeReplies === 1 ? "y" : "ies"}
          </span>{" "}
          into{" "}
          <span className="font-semibold">
            {totalOpportunities.toLocaleString()} real opportunity
            {totalOpportunities === 1 ? "" : "ies"}
          </span>{" "}
          ({safeHot} hot · {safeWarm} warm).
        </p>
        <p className="text-[11px] text-slate-700/90 dark:text-amber-200/80">
          These are homeowners SmartSend kept alive with automatic follow-ups, so you
          can focus on bids, crews, and installs instead of chasing emails.
        </p>
      </div>
    </div>
  );
}











































