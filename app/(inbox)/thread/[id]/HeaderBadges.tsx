"use client";

import { Badge } from "@/components/ui/badge";
import { ReclassifyDropdown } from "./ReclassifyDropdown";

type HeaderBadgesProps = {
  replied_at?: string | null;
  paused_until?: string | null;
  paused_reason?: string | null;
  last_reply_intent?: string | null;
  is_paused?: boolean;
  is_suppressed?: boolean;
  thread_id: string;
};

export function HeaderBadges({
  replied_at,
  paused_until,
  paused_reason,
  last_reply_intent,
  is_paused,
  is_suppressed,
  thread_id,
}: HeaderBadgesProps) {
  const pausedLabel = buildPausedLabel(paused_reason, paused_until, is_paused);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {is_suppressed ? (
        <Badge className="border border-zinc-700 bg-zinc-900 text-[10px] text-white hover:bg-zinc-900">
          Suppressed
        </Badge>
      ) : null}
      {replied_at ? (
        <Badge variant="secondary">
          Replied • {formatDate(replied_at)}
        </Badge>
      ) : null}
      {pausedLabel ? <Badge className="bg-yellow-100 text-yellow-900 hover:bg-yellow-100">{pausedLabel}</Badge> : null}
      {last_reply_intent ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline">{last_reply_intent}</Badge>
          <ReclassifyDropdown threadId={thread_id} current={last_reply_intent} />
        </div>
      ) : (
        <ReclassifyDropdown threadId={thread_id} />
      )}
    </div>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function buildPausedLabel(reason?: string | null, until?: string | null, isPaused?: boolean) {
  if (!isPaused && !until) return null;
  let base = `Paused • ${reason ?? "reply"}`;
  if (until) {
    base = `${base} until ${formatDate(until)}`;
  }
  return base;
}

