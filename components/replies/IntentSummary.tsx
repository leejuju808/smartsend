"use client";

import { Badge } from "@/components/ui/badge";

const intentColorMap: Record<string, string> = {
  ready_to_meet: "bg-green-500/10 text-green-500",
  open_to_chat: "bg-emerald-500/10 text-emerald-500",
  needs_info: "bg-blue-500/10 text-blue-500",
  follow_up_later: "bg-amber-500/10 text-amber-500",
  not_interested: "bg-red-500/10 text-red-500",
  unsubscribe: "bg-red-600/10 text-red-600",
  referral: "bg-purple-500/10 text-purple-500",
  out_of_office: "bg-slate-500/10 text-slate-500",
  unclear: "bg-slate-500/10 text-slate-500",
};

interface SuggestedMeetingTime {
  start: string;
  end: string;
  timezone: string;
  note: string;
}

interface ReplyWithIntent {
  intent_label?: string | null;
  intent_confidence?: number | null;
  meeting_readiness?: string | null;
  suggested_meeting_times?: SuggestedMeetingTime[] | null;
}

export function IntentSummary({ reply }: { reply: ReplyWithIntent }) {
  if (!reply.intent_label) return null;

  const cls =
    intentColorMap[reply.intent_label] ||
    "bg-slate-500/10 text-slate-500";

  return (
    <div className="space-y-2 rounded-lg border p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground">
          AI Intent
        </span>
        <Badge className={cls}>
          {reply.intent_label.replace(/_/g, " ")}
        </Badge>
      </div>
      {typeof reply.intent_confidence === "number" && (
        <p className="text-[11px] text-muted-foreground">
          Confidence: {(reply.intent_confidence * 100).toFixed(0)}%
        </p>
      )}
      {reply.meeting_readiness && (
        <p className="text-[11px] text-muted-foreground">
          Meeting Readiness: <span className="font-medium">{reply.meeting_readiness}</span>
        </p>
      )}
      {Array.isArray(reply.suggested_meeting_times) &&
        reply.suggested_meeting_times.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Suggested meeting times:
            </p>
            <ul className="space-y-1">
              {reply.suggested_meeting_times.map((slot: SuggestedMeetingTime, idx: number) => (
                <li key={idx} className="flex flex-col rounded bg-muted px-2 py-1">
                  <span className="text-[11px] font-medium">
                    {slot.note}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(slot.start).toLocaleString(undefined, { timeZone: slot.timezone })} → {new Date(slot.end).toLocaleString(undefined, { timeZone: slot.timezone })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}

