"use client";

import * as React from "react";
import {
  getLeadDetail,
  type LeadDetail,
} from "@/app/api/leads/detail/actions";
import type { TimelineEvent, TimelineEventType } from "@/app/api/leads/[leadId]/timeline/route";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Mail, Users, MailOpen, MessageCircle, XCircle, Bell, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadDetailDrawerProps {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function statusBadge(status: LeadDetail["email_status"]) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-500/15 text-emerald-600">Active</Badge>;
    case "replied":
      return <Badge className="bg-blue-500/15 text-blue-600">Replied</Badge>;
    case "unsubscribed":
      return <Badge className="bg-red-500/15 text-red-600">Unsubscribed</Badge>;
    case "bounced":
      return <Badge className="bg-slate-500/15 text-slate-600">Bounced</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

function eventIcon(e: TimelineEvent) {
  switch (e.type) {
    case "email_outbound":
      return <MailOpen className="h-3.5 w-3.5 text-primary" />;
    case "email_inbound":
      const intent = e.meta?.intent;
      if (intent === "hot") {
        return <MessageCircle className="h-3.5 w-3.5 text-red-500" />;
      }
      if (intent === "warm") {
        return <MessageCircle className="h-3.5 w-3.5 text-orange-500" />;
      }
      if (intent === "not_interested" || intent === "unsubscribe") {
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      }
      return <MessageCircle className="h-3.5 w-3.5 text-blue-500" />;
    case "auto_follow_up":
      return <ArrowRight className="h-3.5 w-3.5 text-purple-500" />;
    case "routing":
      return <Zap className="h-3.5 w-3.5 text-yellow-500" />;
    case "sms_notification":
      return <Bell className="h-3.5 w-3.5 text-green-500" />;
    case "status_change":
    case "pipeline_change":
      return <ArrowRight className="h-3.5 w-3.5 text-slate-500" />;
    default:
      return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function eventBadge(e: TimelineEvent) {
  const intent = e.meta?.intent;
  if (intent === "hot") {
    return <Badge className="bg-red-500/15 text-red-600 text-[10px]">HOT</Badge>;
  }
  if (intent === "warm") {
    return <Badge className="bg-orange-500/15 text-orange-600 text-[10px]">WARM</Badge>;
  }
  if (e.type === "auto_follow_up") {
    return <Badge className="bg-purple-500/15 text-purple-600 text-[10px]">AUTO</Badge>;
  }
  if (e.type === "sms_notification") {
    return <Badge className="bg-green-500/15 text-green-600 text-[10px]">SMS</Badge>;
  }
  return null;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

export function LeadDetailDrawer({
  leadId,
  open,
  onOpenChange,
}: LeadDetailDrawerProps) {
  const [lead, setLead] = React.useState<LeadDetail | null>(null);
  const [timeline, setTimeline] = React.useState<TimelineEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !leadId) {
      setLead(null);
      setTimeline([]);
      setHasMore(false);
      setNextCursor(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      getLeadDetail(leadId),
      fetch(`/api/leads/${leadId}/timeline?limit=50`).then((res) => res.json()),
    ])
      .then(([detail, timelineData]) => {
        if (cancelled) return;
        setLead(detail);
        setTimeline(timelineData.events || []);
        setHasMore(timelineData.has_more || false);
        setNextCursor(timelineData.next_cursor || null);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || !leadId) return;

    try {
      const res = await fetch(
        `/api/leads/${leadId}/timeline?limit=50&cursor=${nextCursor}`
      );
      const data = await res.json();
      setTimeline((prev) => [...prev, ...(data.events || [])]);
      setHasMore(data.has_more || false);
      setNextCursor(data.next_cursor || null);
    } catch (err) {
      console.error("Failed to load more timeline events:", err);
    }
  }, [nextCursor, leadId]);

  const fullName =
    (lead?.first_name || lead?.last_name)
      ? [lead?.first_name, lead?.last_name].filter(Boolean).join(" ")
      : "Unnamed lead";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 border-l bg-background p-0 sm:max-w-xl">
        <div className="border-b px-4 py-3">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-primary" />
              Lead details
            </SheetTitle>
            <SheetDescription className="text-xs">
              View lead profile and a timeline of sends and replies.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 space-y-3 px-4 py-3">
          {loading || !lead ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Top card: identity + status */}
              <Card className="border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{fullName}</span>
                      {statusBadge(lead.email_status)}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {lead.email || "no-email@example.com"}
                      </span>
                      {lead.company && (
                        <span className="text-[11px] text-muted-foreground">
                          {lead.title ? `${lead.title} @ ` : ""}
                          {lead.company}
                        </span>
                      )}
                      {lead.city || lead.country ? (
                        <span className="text-[11px] text-muted-foreground">
                          {[lead.city, lead.country].filter(Boolean).join(", ")}
                        </span>
                      ) : null}
                      {(lead.phone || lead.website) && (
                        <span className="text-[11px] text-muted-foreground">
                          {lead.phone && `☎ ${lead.phone}`}{" "}
                          {lead.phone && lead.website && "·"}{" "}
                          {lead.website && lead.website}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">Created</p>
                    <p className="text-xs font-medium">
                      {new Date(lead.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">Last reply</p>
                    <p className="text-xs font-medium">
                      {lead.last_reply_at
                        ? new Date(lead.last_reply_at).toLocaleString()
                        : "—"}
                    </p>
                    {lead.last_reply_kind && (
                      <p className="text-[10px] text-muted-foreground">
                        kind: {lead.last_reply_kind}
                      </p>
                    )}
                  </div>
                  <div className="rounded-md border bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">Tags</p>
                    <p className="text-[11px] font-medium">
                      {lead.tags && lead.tags.length > 0
                        ? lead.tags.join(", ")
                        : "—"}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Activity Timeline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Activity Timeline</p>
                  <p className="text-[11px] text-muted-foreground">
                    {timeline.length} event{timeline.length === 1 ? "" : "s"}
                  </p>
                </div>

                {timeline.length === 0 ? (
                  <Card className="border bg-card px-3 py-4 text-center text-xs text-muted-foreground">
                    No activity yet for this lead.
                  </Card>
                ) : (
                  <Card className="border bg-card p-0">
                    <div className="max-h-[500px] overflow-y-auto">
                      <div className="relative px-4 py-3">
                        {/* Vertical timeline line */}
                        <div className="absolute left-7 top-3 bottom-3 w-0.5 bg-border" />
                        
                        <div className="space-y-3">
                          {timeline.map((e, idx) => (
                            <div
                              key={`${e.type}-${e.id}`}
                              className="relative flex gap-3 text-xs"
                            >
                              {/* Timeline dot */}
                              <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background border-2 border-border">
                                {eventIcon(e)}
                              </div>
                              
                              {/* Event content */}
                              <div className="flex-1 min-w-0 space-y-1 pb-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="font-medium truncate">
                                      {e.title}
                                    </p>
                                    {eventBadge(e)}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {formatTimeAgo(e.created_at)}
                                  </span>
                                </div>
                                
                                {e.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    {e.description}
                                  </p>
                                )}
                                
                                {/* Additional meta info */}
                                {e.meta && (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {e.meta.intent && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {e.meta.intent}
                                      </Badge>
                                    )}
                                    {e.meta.next_action && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {e.meta.next_action}
                                      </Badge>
                                    )}
                                    {e.meta.status && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {e.meta.status}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Load more button */}
                        {hasMore && (
                          <div className="pt-2 pb-1">
                            <button
                              onClick={loadMore}
                              className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                            >
                              Load more events...
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t px-4 py-3">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}













