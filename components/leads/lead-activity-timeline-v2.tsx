"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import {
  Mail,
  MailOpen,
  MousePointer2,
  MessageCircle,
  Bot,
  Shuffle,
  Brain,
  Activity as ActivityIcon,
  CircleDot,
} from "lucide-react";
import { LeadActivityEvent } from "@/types/lead-activity";
import { cn } from "@/lib/utils";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconForEvent(eventType: string) {
  switch (eventType) {
    case "email_sent":
      return <Mail className="h-4 w-4" />;
    case "email_open":
      return <MailOpen className="h-4 w-4" />;
    case "email_click":
      return <MousePointer2 className="h-4 w-4" />;
    case "reply_received":
      return <MessageCircle className="h-4 w-4" />;
    case "intent_scored":
      return <Brain className="h-4 w-4" />;
    case "pipeline_changed":
      return <Shuffle className="h-4 w-4" />;
    case "autopilot_queued":
    case "autopilot_dispatched":
    case "stop_outreach":
      return <Bot className="h-4 w-4" />;
    default:
      return <ActivityIcon className="h-4 w-4" />;
  }
}

function labelForEvent(event: LeadActivityEvent) {
  const p = event.payload || {};
  switch (event.event_type) {
    case "email_sent":
      return `Email sent (${event.source || "campaign"})`;
    case "email_open":
      return `Email opened`;
    case "email_click":
      return `Link clicked`;
    case "reply_received":
      return `Reply received`;
    case "intent_scored":
      return `Intent scored (${p.signal_type ?? "signal"})`;
    case "pipeline_changed":
      return `Stage changed: ${p.from ?? "?"} → ${p.to ?? "?"}`;
    case "autopilot_queued":
      return `AI follow-up queued (${p.template_key ?? "template"})`;
    case "autopilot_dispatched":
      return `AI follow-up dispatched`;
    case "stop_outreach":
      return `Outreach stopped`;
    default:
      return event.event_type;
  }
}

function metaForEvent(event: LeadActivityEvent) {
  const p = event.payload || {};
  switch (event.event_type) {
    case "email_sent":
      return p.subject ? `Subject: ${p.subject}` : null;
    case "reply_received":
      return p.snippet || null;
    case "intent_scored":
      if (p.old_score != null && p.new_score != null) {
        return `Score: ${p.old_score} → ${p.new_score} | Stage: ${p.old_pipeline_stage} → ${p.new_pipeline_stage}`;
      }
      return null;
    case "autopilot_queued":
      return p.scheduled_at
        ? `Scheduled at ${formatTime(p.scheduled_at)}`
        : null;
    case "email_click":
      return p.url || null;
    case "pipeline_changed":
      return p.reason || null;
    default:
      return null;
  }
}

function badgeForSource(source: string | null) {
  if (!source) return null;
  const map: Record<string, string> = {
    ai_sdr:
      "bg-purple-500/10 text-purple-500 border-purple-500/40",
    campaign:
      "bg-blue-500/10 text-blue-500 border-blue-500/40",
    tracking:
      "bg-amber-500/10 text-amber-500 border-amber-500/40",
    system:
      "bg-slate-500/10 text-slate-500 border-slate-500/40",
  };
  const cls =
    map[source] ||
    "bg-slate-500/10 text-slate-500 border-slate-500/40";
  return (
    <Badge variant="outline" className={cn("text-[10px] uppercase", cls)}>
      {source}
    </Badge>
  );
}

export function LeadActivityTimelineV2({
  events,
}: {
  events: LeadActivityEvent[];
}) {
  if (!events || events.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center border-dashed py-8 text-center text-sm text-muted-foreground">
        <CircleDot className="mb-2 h-5 w-5" />
        No activity yet for this lead.
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ActivityIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Activity Timeline
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Most recent first
        </span>
      </div>

      <Separator />

      <div className="relative space-y-4">
        {/* Vertical line */}
        <div className="pointer-events-none absolute left-[10px] top-0 h-full w-px bg-border" />

        {events.map((event, idx) => {
          const label = labelForEvent(event);
          const meta = metaForEvent(event);
          const time = formatTime(event.created_at);

          return (
            <div key={event.id} className="relative flex gap-3">
              {/* Dot + icon */}
              <div className="relative mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-background ring-2 ring-border">
                <div className="rounded-full bg-muted p-1">
                  {iconForEvent(event.event_type)}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 rounded-md border bg-card px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{label}</span>
                    {badgeForSource(event.source)}
                  </div>
                  <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                    {time}
                  </span>
                </div>

                {meta && (
                  <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                    {meta}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

