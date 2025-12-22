"use client";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import AiBadge from "@/components/AiBadge";

type ThreadListItem = {
  id: string;
  lead_email?: string;
  lead_email_status?: string | null;
  updated_at?: string | null;
  needs_reply?: boolean | null;
  replied_at?: string | null;
  bounced_at?: string | null;
  unsubscribed_at?: string | null;
  stopped_by_reply?: boolean | null;
  last_snippet?: string | null;
  last_inbound_ai_label?: string | null;
  last_inbound_ai_score?: number | null;
  last_ai_label?: string | null;
  last_ai_score?: number | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
};

type ThreadListProps = {
  items: ThreadListItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  selected: Set<string>;
  onToggle: (id: string, next: boolean) => void;
};

export default function ThreadList({ items, activeId, onSelect, selected, onToggle }: ThreadListProps) {
  return (
    <div className="space-y-1 overflow-auto h-[calc(100vh-11rem)]">
      {items.map((t) => {
        const needs = t.needs_reply ?? (t.replied_at ? false : true);
        const label = t.last_inbound_ai_label ?? t.last_ai_label ?? null;
        const score = t.last_inbound_ai_score ?? t.last_ai_score ?? undefined;
        return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(t.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(t.id);
              }
            }}
            className={cn(
              "w-full p-3 rounded-xl border hover:bg-muted cursor-pointer transition-colors",
              activeId === t.id && "bg-muted",
              selected.has(t.id) && "border-primary"
            )}
          >
            <div className="flex items-start gap-2">
              <Checkbox
                checked={selected.has(t.id)}
                onCheckedChange={(value) => onToggle(t.id, Boolean(value))}
                onClick={(event) => event.stopPropagation()}
              />

              <div className="flex-1">
                <div className="flex justify-between gap-3">
                  <div className="font-medium truncate">{t.lead_email}</div>
                  <div className="text-xs opacity-60 whitespace-nowrap">
                    {t.updated_at ? new Date(t.updated_at).toLocaleString() : ""}
                  </div>
                </div>
                <div className="text-xs opacity-70 truncate">{t.last_snippet ?? "—"}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] opacity-80">
                  {needs ? (
                    <span className="px-2 py-0.5 rounded-full border border-amber-300 bg-amber-100 text-amber-900">
                      Needs reply
                    </span>
                  ) : t.replied_at ? (
                    <span className="px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-100 text-emerald-900">
                      Replied
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full border">Closed</span>
                  )}
                  {(t.bounced_at || t.lead_email_status === 'hard' || t.lead_email_status === 'soft' || t.lead_email_status === 'block') && (
                    <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded">
                      {t.lead_email_status === 'hard' ? 'Hard Bounce' : t.lead_email_status === 'block' ? 'Blocked' : 'Bounced'}
                    </span>
                  )}
                  {t.unsubscribed_at && (
                    <span className="px-2 py-0.5 rounded-full border">Unsub</span>
                  )}
                  {t.stopped_by_reply && !t.replied_at && (
                    <span className="px-2 py-0.5 rounded-full border">Stopped</span>
                  )}
                  {label ? <AiBadge label={label} score={score} /> : null}
                  ) : null}
                  {t.assigned_to && (
                    <span className="px-2 py-0.5 rounded-full border">
                      Owner • {t.assigned_to_name || t.assigned_to.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {items.length === 0 && <div className="text-sm opacity-60">No threads yet.</div>}
    </div>
  );
}

