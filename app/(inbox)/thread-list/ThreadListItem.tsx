"use client";

import Link from "next/link";

import { IntentBadge, type Intent } from "@/components/inbox/IntentBadge";

type Row = {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  ai_intent_safe: Intent | null;
  is_paused: boolean;
  is_snoozed: boolean;
  from_email: string | null;
  lead_name: string | null;
  lead_email?: string | null;
  is_suppressed?: boolean | null;
};

export function ThreadListItem({ row }: { row: Row }) {
  const href = `/inbox/thread/${row.id}`;
  const lastMessage = row.last_message_at ? new Date(row.last_message_at) : null;
  const timeLabel = lastMessage && !Number.isNaN(lastMessage.getTime()) ? lastMessage.toLocaleString() : "";
  const displaySubject = row.subject ?? "(no subject)";
  const displaySender = row.lead_name ?? row.from_email ?? row.lead_email ?? "";

  return (
    <Link href={href} className="block">
      <div className="rounded-2xl border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <IntentBadge intent={row.ai_intent_safe ?? "unknown"} />
            {row.is_suppressed ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-white">
                Suppressed
              </span>
            ) : null}
            {row.is_paused && (
              <span className="rounded-full border border-amber-300/60 bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Follow-ups Paused
              </span>
            )}
            {row.is_snoozed && (
              <span className="rounded-full border border-sky-300/60 bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                Snoozed
              </span>
            )}
          </div>
          <time className="text-xs text-zinc-500">{timeLabel}</time>
        </div>
        <div className="mt-1 line-clamp-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {displaySubject}
        </div>
        <div className="text-xs text-zinc-500">{displaySender}</div>
      </div>
    </Link>
  );
}

