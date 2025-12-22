"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{children}</span>;
}

type ThreadStats = {
  sent_count: number | null;
  replies_count: number | null;
  opens: number | null;
  clicks: number | null;
  nudges_done: number | null;
  bounces: number | null;
};

type TLItem = {
  thread_id: string;
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown> | null;
};

export function ThreadInsights({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<ThreadStats | null>(null);
  const [items, setItems] = React.useState<TLItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/thread/${threadId}/analytics`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (cancelled) {
          return;
        }

        setStats(payload?.stats ?? null);
        setItems(Array.isArray(payload?.timeline) ? (payload.timeline as TLItem[]) : []);
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load insights.";
        setError(message);
        setStats(null);
        setItems([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" onKeyDown={handleKeyDown}>
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="h-full w-full max-w-xl overflow-y-auto border-l bg-background p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Thread Insights</div>
          <button className="text-sm text-muted-foreground" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Kpi label="Sends" value={stats?.sent_count ?? 0} />
              <Kpi label="Replies" value={stats?.replies_count ?? 0} />
              <Kpi label="Opens" value={stats?.opens ?? 0} />
              <Kpi label="Clicks" value={stats?.clicks ?? 0} />
              <Kpi label="Nudges" value={stats?.nudges_done ?? 0} />
              <Kpi label="Bounces" value={stats?.bounces ?? 0} />
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={`${item.thread_id}-${item.kind}-${idx}`} className="rounded-xl border p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {formatDate(item.occurred_at)}
                    </div>
                    <Badge>{labelForKind(item.kind)}</Badge>
                  </div>
                  <TimelineBody item={item} />
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-sm text-muted-foreground">No activity yet.</div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-2xl border p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value ?? 0}</div>
    </div>
  );
}

function labelForKind(kind: string) {
  switch (kind) {
    case "message_out":
      return "Outbound";
    case "message_in":
      return "Inbound";
    case "delivery":
      return "Delivery";
    case "open":
      return "Open";
    case "click":
      return "Click";
    case "nudge_task":
      return "Follow-up";
    default:
      return kind;
  }
}

function TimelineBody({ item }: { item: TLItem }) {
  const payload = item.payload ?? {};
  const kind = item.kind;

  if (kind === "message_out" || kind === "message_in") {
    const subject = asString(payload.subject);
    const snippet = asString(payload.snippet);
    const sender = asString(payload.sender);
    const recipient = asString(payload.recipient);
    const aiLabel = asString(payload.ai_label);

    return (
      <div>
        {subject ? <div className="font-medium">{subject}</div> : null}
        {snippet ? <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{snippet}</div> : null}
        {(sender || recipient || aiLabel) && (
          <div className="mt-1 text-xs text-muted-foreground">
            {sender ? `From: ${sender} ` : ""}
            {recipient ? `→ ${recipient}` : ""}
            {aiLabel ? ` • label: ${aiLabel}` : ""}
          </div>
        )}
      </div>
    );
  }

  if (kind === "delivery") {
    const provider = asString(payload.provider);
    const event = asString(payload.event);

    return (
      <div className="text-sm text-muted-foreground">
        Provider: {provider ?? "—"} • Event: <span className="font-medium">{event ?? "unknown"}</span>
      </div>
    );
  }

  if (kind === "open") {
    return <div className="text-sm text-muted-foreground">Email opened</div>;
  }

  if (kind === "click") {
    return <div className="text-sm text-muted-foreground">Link clicked</div>;
  }

  if (kind === "nudge_task") {
    const status = asString(payload.status);
    const reason = asString(payload.reason);

    return (
      <div className="text-sm text-muted-foreground">
        Follow-up task • Status: <span className="font-medium">{status ?? "unknown"}</span>
        {reason ? ` • ${reason}` : ""}
      </div>
    );
  }

  return <div className="text-sm text-muted-foreground">Event</div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

