"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/team/AvatarStack";

const WINDOW_ORDER: Record<string, number> = {
  minute: 0,
  hour: 1,
  day: 2,
};

type Event = {
  id: string;
  created_at: string;
  type: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  invite_id: string | null;
  meta: Record<string, any> | null;
};

type QuotaConfig = {
  kind: string;
  window: string;
  limit_count: number;
};

type QuotaUsage = {
  kind: string;
  window: string;
  used: number;
};

export default function Overview() {
  const { campaignId } = useParams() as { campaignId: string };
  const [events, setEvents] = React.useState<Event[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [team, setTeam] = React.useState<any[]>([]);
  const [quotas, setQuotas] = React.useState<{ config: QuotaConfig[]; usage: QuotaUsage[] }>({ config: [], usage: [] });
  const [stats, setStats] = React.useState({ sent: 0, replied: 0, bounced: 0 });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const [eventsRes, quotaRes, teamRes, statsRes] = await Promise.all([
        fetch(`/api/campaign/${campaignId}/events`).then((r) => r.json()),
        fetch(`/api/campaign/${campaignId}/quota`).then((r) => r.json()),
        fetch(`/api/campaign/${campaignId}/team`).then((r) => r.json()),
        fetch(`/api/campaign/${campaignId}/stats`).then((r) => r.json()),
      ]);

      setEvents(eventsRes.events ?? []);
      setCursor(eventsRes.nextCursor ?? null);
      setQuotas({ config: quotaRes.config ?? [], usage: quotaRes.usage ?? [] });
      setTeam(teamRes.team ?? []);
      setStats({
        sent: statsRes.sent ?? 0,
        replied: statsRes.replied ?? 0,
        bounced: statsRes.bounced ?? 0,
      });
    })();
  }, [campaignId]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const next = await fetch(`/api/campaign/${campaignId}/events?before=${encodeURIComponent(cursor)}`).then((r) =>
        r.json()
      );
      setEvents((prev) => [...prev, ...(next.events ?? [])]);
      setCursor(next.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between rounded-2xl border p-4">
        <div>
          <div className="text-sm font-semibold">Campaign Overview</div>
          <div className="text-xs text-muted-foreground">Shared with team</div>
        </div>
        <AvatarStack team={team} />
      </div>

      <StatsSummary stats={stats} />

      <HeaderQuotas data={quotas} />

      <div className="rounded-2xl border p-4">
        <div className="mb-2 text-sm font-semibold">Recent Activity</div>
        <ul className="space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex items-center justify-between">
              <span>{renderEvent(event)}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(event.created_at).toLocaleString()}
              </span>
            </li>
          ))}
          {!events.length && <div className="py-2 text-sm text-muted-foreground">No activity yet.</div>}
        </ul>
        <div className="pt-3">
          {cursor ? (
            <Button variant="outline" onClick={loadMore} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          ) : (
            <div className="text-xs text-muted-foreground">End of feed.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsSummary({ stats }: { stats: { sent: number; replied: number; bounced: number } }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <div className="rounded-lg border p-3 text-center">
        <div className="text-xs text-muted-foreground">Emails Sent</div>
        <div className="text-xl font-semibold">{stats.sent}</div>
      </div>
      <div className="rounded-lg border p-3 text-center">
        <div className="text-xs text-muted-foreground">Replies</div>
        <div className="text-xl font-semibold">{stats.replied}</div>
      </div>
      <div className="rounded-lg border p-3 text-center">
        <div className="text-xs text-muted-foreground">Bounces</div>
        <div className="text-xl font-semibold">{stats.bounced}</div>
      </div>
    </div>
  );
}

function HeaderQuotas({ data }: { data: { config: QuotaConfig[]; usage: QuotaUsage[] } }) {
  const rows = (data.config ?? [])
    .map((config) => {
      const usage = (data.usage ?? []).find((item) => item.kind === config.kind && item.window === config.window);
      return { kind: config.kind, window: config.window, used: usage?.used ?? 0, limit: config.limit_count };
    })
    .sort((a, b) => {
      if (a.kind === b.kind) {
        return (WINDOW_ORDER[a.window] ?? 99) - (WINDOW_ORDER[b.window] ?? 99);
      }
      return a.kind.localeCompare(b.kind);
    });

  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2 text-sm font-semibold">Quota</div>
      <div className="grid gap-2 md:grid-cols-3">
        {rows.map((row, idx) => (
          <div key={`${row.kind}-${row.window}-${idx}`} className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">
              {row.kind} / {row.window}
            </div>
            <div className="text-lg font-semibold">
              {row.used} / {row.limit}
            </div>
            <div className="text-xs text-muted-foreground">
              Resets {row.window === "day" ? "daily" : row.window === "hour" ? "hourly" : "each minute"}.
            </div>
          </div>
        ))}
        {!rows.length && <div className="text-sm text-muted-foreground">No quotas configured.</div>}
      </div>
    </div>
  );
}

function renderEvent(event: Event) {
  const meta = event.meta ?? {};
  switch (event.type) {
    case "invite_created":
      return (
        <>
          Invited <b>{meta.email}</b> as <b>{meta.role}</b>
        </>
      );
    case "invite_canceled":
      return <>Canceled an invite</>;
    case "invite_accepted":
      return (
        <>
          Invite accepted (<b>{meta.email}</b>) → role <b>{meta.accepted_role}</b>
        </>
      );
    case "member_role_changed":
      return (
        <>
          Changed member role to <b>{meta.role}</b>
        </>
      );
    case "member_removed":
      return <>Removed a member</>;
    default:
      return <>Updated team</>;
  }
}

