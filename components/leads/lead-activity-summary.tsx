"use client";

import { useMemo } from "react";
import { Calendar, Mail, MessageSquare, Briefcase } from "lucide-react";

interface LeadActivity {
  id: string;
  type: string;
  occurred_at: string;
  metadata: Record<string, any>;
}

interface LeadActivitySummaryProps {
  activities: LeadActivity[];
  deals?: Array<{ id: string; stage: string }>;
}

export function LeadActivitySummary({ activities, deals }: LeadActivitySummaryProps) {
  const summary = useMemo(() => {
    if (!activities || activities.length === 0) {
      return {
        firstSeen: null,
        lastTouch: null,
        lastEmail: null,
        lastReply: null,
        currentDealStage: deals?.[0]?.stage || null,
      };
    }

    const sorted = [...activities].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );

    const firstSeen = sorted[0]?.occurred_at || null;
    const lastTouch = sorted[sorted.length - 1]?.occurred_at || null;

    const emailActivities = activities.filter((a) =>
      ["email_sent", "email_open", "email_click"].includes(a.type)
    );
    const lastEmail =
      emailActivities.length > 0
        ? emailActivities.sort(
            (a, b) =>
              new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
          )[0]?.occurred_at
        : null;

    const replyActivities = activities.filter((a) => a.type === "reply");
    const lastReply =
      replyActivities.length > 0
        ? replyActivities.sort(
            (a, b) =>
              new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
          )[0]?.occurred_at
        : null;

    const currentDealStage = deals?.[0]?.stage || null;

    return {
      firstSeen,
      lastTouch,
      lastEmail,
      lastReply,
      currentDealStage,
    };
  }, [activities, deals]);

  function formatDate(dateString: string | null): string {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  function daysAgo(dateString: string | null): number | null {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">First seen</p>
          <p className="text-sm font-medium">{formatDate(summary.firstSeen)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Last touch</p>
          <p className="text-sm font-medium">{formatDate(summary.lastTouch)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Last email</p>
          <p className="text-sm font-medium">
            {summary.lastEmail
              ? `${daysAgo(summary.lastEmail)} days ago`
              : "Never"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Last reply</p>
          <p className="text-sm font-medium">
            {summary.lastReply
              ? `${daysAgo(summary.lastReply)} days ago`
              : "Never"}
          </p>
        </div>
      </div>

      {summary.currentDealStage && (
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Deal stage</p>
            <p className="text-sm font-medium capitalize">
              {summary.currentDealStage.replace(/_/g, " ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}








