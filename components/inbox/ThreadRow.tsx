"use client";

import * as React from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import CooldownPill from "./CooldownPill";
import NudgedPill from "./NudgedPill";
import ThreadRowMenu from "./ThreadRowMenu";
import RepliedPill from "./RepliedPill";
import { StateBadge } from "@/components/replies/state-badge";

type Row = {
  id: string;
  subject: string | null;
  updated_at: string;
  reply_type?: string | null;
  flags: { is_nudged: boolean; is_snoozed: boolean; last_outbound_at: string | null };
  onLocalUpdate?: (patch: Partial<Row["flags"]>) => void;
  selected?: boolean;
  onSelectToggle?: (checked: boolean) => void;
  replied_at?: string | null;
  last_reply_intent?: string | null;
  lead_paused_until?: string | null;
  lead_paused_reason?: string | null;
  latest_intent?: string | null;
  intent_subtype?: string | null;
  intent_confidence?: number | null;
  auto_paused?: boolean;
  state?: string | null;
};

const INTENT_META: Record<
  string,
  {
    label: string;
    className: string;
  }
> = {
  replied: { label: "Replied", className: "bg-emerald-600 text-white" },
  out_of_office: { label: "OOO", className: "bg-amber-500 text-black" },
  not_interested: { label: "Not Interested", className: "bg-rose-600 text-white" },
  scheduling: { label: "Scheduling", className: "bg-sky-600 text-white" },
  question: { label: "Question", className: "bg-indigo-600 text-white" },
  neutral: { label: "Neutral", className: "bg-zinc-600 text-white" },
  unclear: { label: "Unclear", className: "bg-zinc-400 text-black" },
};

export default function ThreadRow({ row }: { row: Row }) {
  const {
    id,
    subject,
    updated_at,
    flags,
    reply_type,
    replied_at,
    last_reply_intent,
    lead_paused_until,
    lead_paused_reason,
    onLocalUpdate,
    selected,
    onSelectToggle,
  } = row;
  const [nextAt, setNextAt] = React.useState<string | null>(null);
  const repliedLabel = React.useMemo(() => {
    if (!replied_at) return null;
    const parsed = new Date(replied_at);
    if (Number.isNaN(parsed.getTime())) return "recently";
    return parsed.toLocaleDateString();
  }, [replied_at]);

  const pausedBadge = React.useMemo(() => {
    if (!lead_paused_until) return null;
    const parsed = new Date(lead_paused_until);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.getTime() <= Date.now()) return null;
    return {
      until: parsed.toLocaleDateString(),
      reason: lead_paused_reason ?? "reply",
    };
  }, [lead_paused_reason, lead_paused_until]);

  const intent = (row.latest_intent ?? row.last_reply_intent ?? null) as string | null;
  const intentMeta = intent ? INTENT_META[intent] ?? INTENT_META.unclear : INTENT_META.unclear;
  const intentLabel = intent ? intentMeta.label : "Unclassified";
  const autoPaused = Boolean(row.auto_paused);

  React.useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch(`/api/thread/${id}/cooldown`, { cache: "no-store" });
        const payload = await response.json();

        if (active && payload?.ok) {
          setNextAt(payload.cooldown?.next_eligible_at ?? null);
        }
      } catch {
        if (active) {
          setNextAt(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex items-center justify-between gap-3 border-b px-3 py-2 hover:bg-muted/40">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={!!selected}
          onCheckedChange={(v) => onSelectToggle?.(!!v)}
          aria-label="Select thread"
        />
        <Link href={`/inbox/thread/${id}`} className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate font-medium">{subject || "(no subject)"}</div>
            {row.state && <StateBadge state={row.state} />}
            <Badge className={`rounded-2xl px-2 py-0.5 text-[10px] ${intentMeta.className}`}>
              {intentLabel}
            </Badge>
            {autoPaused && (
              <Badge variant="outline" className="rounded-2xl px-2 py-0.5 text-[10px]">
                Auto-Paused
              </Badge>
            )}
            {repliedLabel && <RepliedPill label={repliedLabel} />}
            {pausedBadge && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                Paused • {pausedBadge.reason} until {pausedBadge.until}
              </span>
            )}
            {(intent === "scheduling" || intent === "meeting") && (
              <Link
                href="/dashboard/meetings"
                className="text-[10px] text-emerald-300 underline"
                onClick={(e) => e.stopPropagation()}
              >
                View meeting card
              </Link>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Updated {new Date(updated_at).toLocaleString()}
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <CooldownPill nextAt={nextAt} />
        {flags.is_nudged && <NudgedPill />}
        {flags.is_snoozed && <span className="text-xs text-muted-foreground">Snoozed</span>}
        <ThreadRowMenu
          threadId={id}
          isNudged={flags.is_nudged}
          onCancelled={() => onLocalUpdate?.({ is_nudged: false })}
        />
      </div>
    </div>
  );
}