"use client";

import { InboxThread } from "@/lib/hooks/useInboxThreads";
import { ReplyCategoryBadge } from "@/components/inbox/ReplyCategoryBadge";
import { Mail, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LeadScoreBadge } from "@/components/LeadScoreBadge";

export function InboxThreadsList({
  threads,
  loading,
  onSelect,
}: {
  threads: InboxThread[];
  loading: boolean;
  onSelect?: (thread: InboxThread) => void;
}) {
  if (loading) {
    return (
      <p className="text-[11px] text-muted-foreground px-1 py-2">
        Loading threads…
      </p>
    );
  }

  if (!threads.length) {
    return (
      <p className="text-[11px] text-muted-foreground px-1 py-2">
        No threads match these filters yet.
      </p>
    );
  }

  return (
    <div className="text-xs max-h-[580px] overflow-y-auto space-y-1 p-3">
      {threads.map((t) => (
        <button
          key={t.thread_key}
          type="button"
          onClick={() => onSelect?.(t)}
          className="w-full text-left border rounded-md px-3 py-2 bg-slate-950/70 space-y-1 hover:bg-slate-900/80 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-semibold flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {t.lead_email || "Lead"}
              </span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                {t.lead_company}
                {t.campaign_name && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>{t.campaign_name}</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <LeadScoreBadge scoreTotal={t.score_total ?? null} />
                <ReplyCategoryBadge category={t.last_ai_category} />
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"}
                </span>
              </div>
              <Badge
                className={
                  t.thread_status === "handled"
                    ? "bg-emerald-900/80 border-emerald-600 text-[10px]"
                    : "bg-sky-900/80 border-sky-600 text-[10px]"
                }
              >
                {t.thread_status === "handled" ? "Handled" : "Open"}
              </Badge>
              {t.meeting_status && (
                <Badge className="bg-emerald-900/80 border-emerald-600 text-[10px]">
                  {t.meeting_status === "booked"
                    ? "Booked"
                    : t.meeting_status === "completed"
                    ? "Completed"
                    : t.meeting_status === "no_show"
                    ? "No show"
                    : t.meeting_status === "canceled"
                    ? "Canceled"
                    : "Pending"}
                </Badge>
              )}
              {t.has_meeting && (
                <span className="text-[10px] text-emerald-400">
                  Meeting intent in thread
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(t.last_reply_at).toLocaleString()}
              </span>
            </div>
          </div>

          {t.last_subject && (
            <div className="text-[11px] font-semibold mt-1">
              {t.last_subject}
            </div>
          )}

          {t.last_ai_intent && (
            <div className="text-[10px] text-emerald-300">
              AI: {t.last_ai_intent}
            </div>
          )}

          <div className="text-[11px] text-muted-foreground line-clamp-2">
            {t.last_body}
          </div>
        </button>
      ))}
    </div>
  );
}

