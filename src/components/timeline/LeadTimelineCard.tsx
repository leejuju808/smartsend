"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrowserSupabase } from "@/utils/supabase/client";
import Link from "next/link";
import { ArrowRight, Bot, Hand, Hourglass, Skull, Zap } from "lucide-react";

type TimelineEvent = {
  id: string;
  lane: "system" | "touched";
  event_type: string;
  meta: any;
  created_at: string;
  email_id: string | null;
  campaign_id: string | null;
};

export default function LeadTimelineCard({ leadId }: { leadId: string }) {
  const [systemEvents, setSystemEvents] = useState<TimelineEvent[]>([]);
  const [touchedEvents, setTouchedEvents] = useState<TimelineEvent[]>([]);

  const followupState = useMemo(() => {
    const byType = (t: string) => systemEvents.filter((e) => e.event_type === t);
    const last = (arr: TimelineEvent[]) => arr[arr.length - 1] ?? null;

    const lastSent = last(byType("sent"));
    const lastOpened = last(byType("opened"));
    const lastClicked = last(byType("clicked"));
    const lastReplied = last(byType("replied"));
    const lastBounced = last(byType("bounced"));

    const lastEngagementAt = (() => {
      const a = lastOpened?.created_at ? new Date(lastOpened.created_at).getTime() : 0;
      const b = lastClicked?.created_at ? new Date(lastClicked.created_at).getTime() : 0;
      const t = Math.max(a, b);
      return t ? new Date(t) : null;
    })();

    if (lastBounced) return { state: "dead" as const, href: "/dashboard/daily" };

    // If they replied and we haven't sent an outbound reply after that reply, they are waiting on us.
    if (lastReplied?.created_at) {
      const repliedAt = new Date(lastReplied.created_at).getTime();
      const lastOutbound = touchedEvents
        .filter((e) => e.event_type === "reply_sent")
        .reduce<number>((acc, e) => {
          const t = new Date(e.created_at).getTime();
          return t > acc ? t : acc;
        }, 0);
      if (!lastOutbound || lastOutbound < repliedAt) {
        return { state: "waiting" as const, href: "/inbox" };
      }
    }

    // Nudge when there was engagement, but no reply, and it's been a bit.
    if (lastEngagementAt && !lastReplied) {
      const hoursSinceEngagement = (Date.now() - lastEngagementAt.getTime()) / 36e5;
      const hoursSinceSent = lastSent?.created_at ? (Date.now() - new Date(lastSent.created_at).getTime()) / 36e5 : null;
      if (hoursSinceEngagement >= 36 && (hoursSinceSent === null || hoursSinceSent >= 48)) {
        return { state: "nudge" as const, href: "/dashboard/daily" };
      }
    }

    return { state: "waiting" as const, href: "/dashboard/daily" };
  }, [systemEvents, touchedEvents]);

  useEffect(() => {
    const load = async () => {
      const r = await fetch(`/api/leads/${leadId}/timeline`);
      const j = await r.json();
      const lanes = j?.lanes || {};
      setSystemEvents(lanes.system || []);
      setTouchedEvents(lanes.touched || []);
    };
    load();

    // Realtime updates (best-effort): reload when new events land.
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel(`lead-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_events",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_events",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_notes",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      channel && supabase.removeChannel(channel);
    };
  }, [leadId]);

  const icon = (lane: TimelineEvent["lane"], t: string) => {
    if (lane === "touched") {
      switch (t) {
        case "note":
          return "📝";
        case "task":
          return "✅";
        case "reply_sent":
          return "↩️";
        case "manual_control":
          return "✋";
        case "inbox_action":
          return "⚡";
        case "conversion":
          return "💰";
        default:
          return "•";
      }
    }
    switch (t) {
      case "sent":
        return "📤";
      case "delivered":
        return "📬";
      case "opened":
        return "👀";
      case "clicked":
        return "🔗";
      case "replied":
        return "💬";
      case "bounced":
        return "⛔";
      case "enqueue_blocked":
        return "🛑";
      case "auto_resumed":
        return "🔄";
      case "ooo_guard_skipped":
        return "🚫";
      case "meeting_scheduled":
        return "🗓️";
      case "handoff_snapshot":
        return "📦";
      default:
        return "•";
    }
  };

  const blockedDescription = (meta: any) => {
    const reason = meta?.reason;
    if (reason === "paused_until") {
      if (meta?.paused_until) {
        return `Auto-paused; follow-ups disabled until ${new Date(meta.paused_until).toLocaleString()}.`;
      }
      return "Auto-paused; follow-ups disabled.";
    }
    if (reason === "has_reply") {
      return "Lead replied; follow-ups disabled.";
    }
    if (reason === "lead_not_found") {
      return "Lead not found; follow-up skipped.";
    }
    if (reason === "db_blocked") {
      return "Follow-up blocked by database guard.";
    }
    return "Follow-up blocked.";
  };

  const autoResumeDescription = (meta: any) => {
    const action = meta?.action;
    if (action === "auto_resume_and_requeue") {
      if (meta?.send_after) {
        return `Resume drip scheduled for ${new Date(meta.send_after).toLocaleString()}.`;
      }
      if (meta?.delay_hours) {
        return `Resume drip scheduled after ${meta.delay_hours} hours.`;
      }
      return "Resume drip scheduled.";
    }
    if (meta?.reason === "guard_blocked") {
      return "Resume drip skipped by guard.";
    }
    if (meta?.reason === "no_step") {
      return "Resume drip skipped (no prior step).";
    }
    return "Lead auto-resumed.";
  };

  const guardSkipDescription = (meta: any) => {
    const base = "Skipped send: recent OOO (campaign guard).";
    const snooze = meta?.snooze_until;
    if (!snooze) {
      return base;
    }
    const date = new Date(snooze);
    const formatted = Number.isNaN(date.getTime()) ? null : date.toLocaleString();
    return formatted ? `${base} Resumes on ${formatted}.` : base;
  };

  const eventLabel = (lane: TimelineEvent["lane"], t: string, meta: any) => {
    if (lane === "touched") {
      switch (t) {
        case "note":
          return "Note";
        case "task":
          return "Task";
        case "reply_sent":
          return "Reply sent";
        case "manual_control": {
          const action = String(meta?.action || "").toLowerCase();
          if (action === "pause") return "Paused";
          if (action === "resume") return "Resumed";
          const ev = String(meta?.event || "").replace(/_/g, " ").trim();
          return ev ? ev.replace(/\b\w/g, (l: string) => l.toUpperCase()) : "Manual action";
        }
        case "inbox_action": {
          const at = String(meta?.action_type || "").trim();
          if (!at) return "Inbox action";
          return `Inbox: ${at.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}`;
        }
        case "conversion": {
          const stage = String(meta?.pipeline_stage || meta?.conversion_type || "").trim();
          if (!stage) return "Conversion";
          return stage.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
        }
        default:
          return t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      }
    }
    switch (t) {
      case "auto_resumed":
        return "Auto-resumed";
      case "enqueue_blocked":
        return "Enqueue blocked";
      case "ooo_guard_skipped":
        return "Skipped send";
      case "meeting_scheduled":
        return "Meeting scheduled";
      case "handoff_snapshot":
        return "Crew handoff created";
      default:
        return t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    }
  };

  const meetingDescription = (meta: any) => {
    if (!meta) return "";
    const title = meta.title || "Meeting";
    const startTime = meta.start_time;
    if (startTime) {
      const date = new Date(startTime);
      const timeStr = date.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      });
      return `${title} — ${timeStr}`;
    }
    return title;
  };

  const touchedDetails = (t: string, meta: any) => {
    if (t === "note") {
      const body = String(meta?.body || "").trim();
      if (!body) return null;
      const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
      return <span className="text-sm text-muted-foreground whitespace-pre-line">{snippet}</span>;
    }
    if (t === "task") {
      const title = String(meta?.title || "").trim();
      const status = String(meta?.status || "").trim();
      const dueAt = meta?.due_at ? new Date(meta.due_at).toLocaleString() : null;
      return (
        <span className="text-sm text-muted-foreground">
          {title || "Task"}{status ? ` • ${status}` : ""}{dueAt ? ` • due ${dueAt}` : ""}
        </span>
      );
    }
    if (t === "reply_sent") {
      const subject = String(meta?.subject || "").trim();
      return subject ? <span className="text-sm text-muted-foreground">Subject: {subject}</span> : null;
    }
    if (t === "inbox_action") {
      const actionType = String(meta?.action_type || "").trim();
      const notes = String(meta?.notes || "").trim();
      const value = meta?.estimated_value ? Number(meta.estimated_value) : null;
      const jobType = String(meta?.job_type || "").trim();
      const prob = meta?.probability ? Number(meta.probability) : null;
      const bits = [
        actionType ? actionType.replace(/_/g, " ") : null,
        jobType ? jobType.replace(/_/g, " ") : null,
        Number.isFinite(value) ? `est ${value!.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` : null,
        Number.isFinite(prob) ? `${prob}%` : null,
      ].filter(Boolean);
      const line = bits.length ? bits.join(" • ") : null;
      const noteLine = notes ? (notes.length > 140 ? `${notes.slice(0, 140)}…` : notes) : null;
      return (
        <span className="text-sm text-muted-foreground">
          {line || "Action recorded"}{noteLine ? ` — ${noteLine}` : ""}
        </span>
      );
    }
    if (t === "conversion") {
      const stage = String(meta?.pipeline_stage || meta?.conversion_type || "").trim();
      const value = meta?.estimated_value ? Number(meta.estimated_value) : null;
      const prob = meta?.probability ? Number(meta.probability) : null;
      const bits = [
        stage ? stage.replace(/_/g, " ") : null,
        Number.isFinite(value) ? `est ${value!.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` : null,
        Number.isFinite(prob) ? `${prob}%` : null,
      ].filter(Boolean);
      return bits.length ? <span className="text-sm text-muted-foreground">{bits.join(" • ")}</span> : null;
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Activity</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1" title="System handled">
                <Bot className="h-4 w-4" />
                <span className="tabular-nums">{systemEvents.length}</span>
              </span>
              <span className="inline-flex items-center gap-1" title="Human touched">
                <Hand className="h-4 w-4" />
                <span className="tabular-nums">{touchedEvents.length}</span>
              </span>
            </div>

            <div className="flex items-center gap-2" aria-label="Follow-up state">
              <span
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                  followupState.state === "nudge" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-muted/20 text-muted-foreground",
                ].join(" ")}
                title="Needs nudge"
              >
                <Zap className="h-4 w-4" />
              </span>
              <span
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                  followupState.state === "waiting" ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-muted/20 text-muted-foreground",
                ].join(" ")}
                title="Waiting"
              >
                <Hourglass className="h-4 w-4" />
              </span>
              <span
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                  followupState.state === "dead" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-muted/20 text-muted-foreground",
                ].join(" ")}
                title="Dead"
              >
                <Skull className="h-4 w-4" />
              </span>
              <Link
                href={followupState.href}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white hover:bg-muted/30"
                title="Open next action"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border bg-muted/10 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Bot className="h-4 w-4" />
                <span className="sr-only">System handled</span>
              </span>
              <span className="tabular-nums">{systemEvents.length}</span>
            </div>
            <ol className="relative border-l pl-4 space-y-3">
              {systemEvents.map((e) => (
                <li key={e.id} className="ml-2">
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none">{icon(e.lane, e.event_type)}</span>
                    <div className="grid">
                      <span className="font-medium">{eventLabel(e.lane, e.event_type, e.meta)}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                      {e.event_type === "clicked" && e.meta?.url && (
                        <span className="text-sm">
                          URL: <span className="underline break-all">{e.meta.url}</span>
                        </span>
                      )}
                      {e.event_type === "enqueue_blocked" && (
                        <span className="text-sm text-muted-foreground">{blockedDescription(e.meta)}</span>
                      )}
                      {e.event_type === "auto_resumed" && (
                        <span className="text-sm text-muted-foreground">{autoResumeDescription(e.meta)}</span>
                      )}
                      {e.event_type === "ooo_guard_skipped" && (
                        <span className="text-sm text-muted-foreground">{guardSkipDescription(e.meta)}</span>
                      )}
                      {e.event_type === "meeting_scheduled" && (
                        <span className="text-sm text-muted-foreground">{meetingDescription(e.meta)}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {systemEvents.length === 0 && (
                <div className="text-sm text-muted-foreground">No system activity yet.</div>
              )}
            </ol>
          </div>

          <div className="rounded-lg border bg-muted/10 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Hand className="h-4 w-4" />
                <span className="sr-only">Human touched</span>
              </span>
              <span className="tabular-nums">{touchedEvents.length}</span>
            </div>
            <ol className="relative border-l pl-4 space-y-3">
              {touchedEvents.map((e) => (
                <li key={e.id} className="ml-2">
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none">{icon(e.lane, e.event_type)}</span>
                    <div className="grid">
                      <span className="font-medium">{eventLabel(e.lane, e.event_type, e.meta)}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                      {touchedDetails(e.event_type, e.meta)}
                    </div>
                  </div>
                </li>
              ))}
              {touchedEvents.length === 0 && (
                <div className="text-sm text-muted-foreground">No manual actions yet.</div>
              )}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

