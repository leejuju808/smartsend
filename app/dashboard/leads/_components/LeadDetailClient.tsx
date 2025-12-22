// app/dashboard/leads/_components/LeadDetailClient.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";

type LeadRow = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  email: string | null;
  name: string | null;
  status: string;
  source: string | null;
  estimated_value: number | null;
  currency: string | null;
  created_at: string;
  is_hot?: boolean | null;
  hot_reason?: string | null;
  hot_score?: number | null;
  smartsend_homeowner?: boolean | null;
};

type ContactRow = {
  id: string;
  workspace_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  created_at: string;
  smartsend_homeowner?: boolean | null;
} | null;

type OutboundRow = {
  id: string;
  campaign_id: string;
  campaign_contact_id: string;
  contact_id: string;
  step_id: string;
  to_email: string;
  subject: string;
  body: string;
  send_at: string;
  sent_at: string | null;
  status: string;
};

type ReplyRow = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
  intent: string | null;
};

type TaskRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  contact_id: string;
  reply_id: string;
  task_type: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
};

type CallNotes = {
  address: string | null;
  issueType: string | null;
  urgency: string | null;
  generatedAt: string | null;
} | null;

interface Props {
  lead: LeadRow;
  contact: ContactRow;
  outbound: OutboundRow[];
  replies: ReplyRow[];
  tasks: TaskRow[];
  callNotes?: CallNotes;
}

type ActivityKind = "outbound" | "reply" | "task";

type ActivityItem = {
  kind: ActivityKind;
  id: string;
  at: string; // ISO date
  title: string;
  subtitle?: string;
  body?: string;
  meta?: string;
  intent?: string | null;
  status?: string;
};

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const then = new Date(dateString).getTime();
    const now = Date.now();
    if (!Number.isFinite(then)) return "—";
    const diffMs = then - now;

    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const abs = Math.abs(diffMs);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (abs < minute) return rtf.format(Math.round(diffMs / 1000), "second");
    if (abs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
    if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
    return rtf.format(Math.round(diffMs / day), "day");
  } catch {
    return dateString;
  }
}

function formatCurrency(
  value: number | null | undefined,
  currency?: string | null
): string {
  if (value == null) return "—";
  const cur = currency || "USD";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  });
}

function leadStatusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium";

  const map: Record<string, string> = {
    new: "border-blue-600 bg-blue-500/10 text-blue-700",
    in_progress: "border-yellow-500 bg-yellow-500/10 text-yellow-700",
    won: "border-emerald-600 bg-emerald-500/10 text-emerald-700",
    lost: "border-gray-500 bg-gray-500/10 text-gray-400",
    responded: "border-emerald-600 bg-emerald-500/10 text-emerald-700",
  };

  const cls = map[status] ?? "border-blue-600 bg-blue-500/10 text-blue-700";

  return (
    <span className={`${base} ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function intentChip(intent: string | null | undefined) {
  if (!intent) return null;

  const base =
    "inline-flex items-center rounded-full border px-2 py-[1px] text-[9px] font-medium";

  if (intent === "hot") {
    return (
      <span className={`${base} border-red-600 bg-red-500/10 text-red-600`}>
        Hot lead
      </span>
    );
  }
  if (intent === "warm") {
    return (
      <span
        className={`${base} border-yellow-500 bg-yellow-500/10 text-yellow-600`}
      >
        Warm lead
      </span>
    );
  }
  if (intent === "not_interested") {
    return (
      <span
        className={`${base} border-gray-500 bg-gray-500/10 text-gray-400`}
      >
        Not interested
      </span>
    );
  }

  return (
    <span
      className={`${base} border-blue-600 bg-blue-500/10 text-blue-600`}
    >
      {intent}
    </span>
  );
}

export default function LeadDetailClient({
  lead,
  contact,
  outbound,
  replies,
  tasks,
  callNotes,
}: Props) {
  const displayName =
    lead.name ||
    (contact
      ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
      : "") ||
    contact?.email ||
    lead.email ||
    "Unknown lead";

  const location =
    contact && (contact.city || contact.state)
      ? `${contact.city ?? ""}${
          contact.city && contact.state ? ", " : ""
        }${contact.state ?? ""}`
      : null;

  const latestReply = replies[replies.length - 1] ?? null;
  const latestOutbound = outbound[outbound.length - 1] ?? null;
  const isSmartSendHomeowner = Boolean(lead.smartsend_homeowner || contact?.smartsend_homeowner);
  const hasCallNotes = Boolean(callNotes?.address || callNotes?.issueType || callNotes?.urgency);

  const activities: ActivityItem[] = useMemo(() => {
    const list: ActivityItem[] = [];

    outbound.forEach((o) => {
      list.push({
        kind: "outbound",
        id: `out-${o.id}`,
        at: o.sent_at ?? o.send_at,
        title: `Email sent`,
        subtitle: o.subject || "(no subject)",
        body: o.body,
        meta: o.status,
        status: o.status,
      });
    });

    replies.forEach((r) => {
      list.push({
        kind: "reply",
        id: `rep-${r.id}`,
        at: r.received_at ?? r.id,
        title: r.from_name || r.from_email || "Reply received",
        subtitle: r.subject || "(no subject)",
        body: r.preview || undefined,
        intent: r.intent,
      });
    });

    tasks.forEach((t) => {
      list.push({
        kind: "task",
        id: `task-${t.id}`,
        at: t.created_at,
        title:
          t.task_type === "follow_up"
            ? "Follow-up task created"
            : `Task: ${t.task_type}`,
        subtitle: `Due ${formatTimeAgo(t.due_at)}`,
        meta: t.completed_at ? "Completed" : "Open",
        status: t.completed_at ? "completed" : "open",
      });
    });

    // Sort by time ascending
    return list.sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      return ta - tb;
    });
  }, [outbound, replies, tasks]);

  const lastTouch =
    latestReply?.received_at ??
    latestOutbound?.sent_at ??
    latestOutbound?.send_at ??
    lead.created_at;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)]">
      {/* Left: Lead summary */}
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        {/* Block 22179 — Hot Lead Banner */}
        {lead.is_hot && (
          <div className="bg-orange-500/20 border border-orange-400 text-orange-300 p-3 rounded-lg">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span>🔥</span>
              <span>Hot Lead</span>
              {lead.hot_score !== null && (
                <span className="text-xs opacity-80">(Score: {lead.hot_score})</span>
              )}
            </div>
            {lead.hot_reason && (
              <p className="text-xs mt-1 opacity-90">{lead.hot_reason}</p>
            )}
          </div>
        )}

        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {displayName}
            </h1>
            {(lead.email || contact?.email) && (
              <p className="text-xs text-muted-foreground">
                {lead.email || contact?.email}
              </p>
            )}
            {location && (
              <p className="text-[11px] text-muted-foreground">
                {location}
              </p>
            )}
            {isSmartSendHomeowner ? (
              <div className="pt-1">
                <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/30 px-2 py-[2px] text-[10px] font-medium text-zinc-100">
                  SmartSend Homeowner
                </span>
              </div>
            ) : null}
            {hasCallNotes ? (
              <div className="pt-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-neutral-100">Call notes</span>
                {callNotes?.address ? (
                  <span> · Address: {callNotes.address}</span>
                ) : null}
                {callNotes?.issueType ? (
                  <span> · Issue: {callNotes.issueType.replace(/_/g, " ")}</span>
                ) : null}
                {callNotes?.urgency ? (
                  <span> · Urgency: {callNotes.urgency}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            {leadStatusBadge(lead.status)}
            {lead.source && (
              <span className="text-[10px] text-muted-foreground">
                Source: {lead.source}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Estimated value
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatCurrency(lead.estimated_value, lead.currency)}
            </p>
          </div>
          <div className="rounded-xl border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Last touch
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatTimeAgo(lastTouch)}
            </p>
          </div>
          <div className="rounded-xl border bg-background px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              First seen
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatTimeAgo(lead.created_at)}
            </p>
          </div>
        </div>

        <div className="mt-2 rounded-xl border bg-background px-3 py-3 text-xs">
          <p className="text-[11px] font-medium">Latest reply</p>
          {latestReply ? (
            <div className="mt-1 flex flex-col gap-[2px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold">
                  {latestReply.subject || "(no subject)"}
                </span>
                {intentChip(latestReply.intent)}
              </div>
              {latestReply.preview && (
                <p className="mt-[2px] line-clamp-3 text-[11px] text-muted-foreground">
                  {latestReply.preview}
                </p>
              )}
              <span className="mt-[2px] text-[10px] text-muted-foreground">
                Received {formatTimeAgo(latestReply.received_at)}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              No replies recorded yet.
            </p>
          )}
        </div>

        {contact?.phone && (
          <div className="rounded-xl border bg-background px-3 py-3 text-xs">
            <p className="text-[11px] font-medium">Phone</p>
            <p className="mt-1 text-sm font-semibold">{contact.phone}</p>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[11px]">
          <Link
            href="/dashboard/leads"
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            ← All leads
          </Link>
        </div>
      </section>

      {/* Right: Activity timeline */}
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Activity timeline</h2>
          <span className="text-[11px] text-muted-foreground">
            {activities.length} event
            {activities.length === 1 ? "" : "s"}
          </span>
        </header>

        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No activity yet. Once SmartSend sends emails and receives
            replies, you'll see the full story here.
          </p>
        ) : (
          <div className="relative mt-1 flex flex-col gap-2">
            {/* Vertical line */}
            <div className="pointer-events-none absolute left-3 top-0 bottom-0 w-px bg-border" />

            {activities.map((a) => {
              const isOutbound = a.kind === "outbound";
              const isReply = a.kind === "reply";
              const isTask = a.kind === "task";

              return (
                <article
                  key={a.id}
                  className="relative ml-6 rounded-xl border bg-background px-3 py-2 text-xs"
                >
                  {/* Dot */}
                  <div className="absolute -left-5 top-2 h-2 w-2 rounded-full border border-background bg-primary" />

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-[2px]">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold">
                          {isOutbound && "Email sent"}
                          {isReply && "Reply received"}
                          {isTask && "Follow-up task"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(a.at)}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium">
                        {a.subtitle || a.title}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isReply && intentChip(a.intent)}
                      {isOutbound && a.status && (
                        <span className="text-[10px] text-muted-foreground">
                          {a.status}
                        </span>
                      )}
                      {isTask && (
                        <span
                          className={`text-[10px] ${
                            a.status === "completed"
                              ? "text-emerald-600"
                              : "text-yellow-600"
                          }`}
                        >
                          {a.status === "completed"
                            ? "Completed"
                            : "Open"}
                        </span>
                      )}
                    </div>
                  </div>

                  {a.body && (
                    <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                      {a.body}
                    </p>
                  )}

                  {a.meta && !isOutbound && !isTask && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {a.meta}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
