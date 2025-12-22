"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Row = {
  id: string;
  campaign_id: string;
  lead_id: string;
  lead_name: string | null;
  lead_company: string | null;
  lead_email: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  replied_at: string | null;
  needs_reply: boolean;
  is_snoozed: boolean;
  snoozed_until: string | null;
  assigned_to: string | null;
  last_inbound_label: string | null;
};

export default function InboxPage() {
  const { campaignId } = useParams() as { campaignId: string };
  const [rows, setRows] = React.useState<Row[]>([]);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [q, setQ] = React.useState("");
  const [needs, setNeeds] = React.useState<"any" | "true" | "false">("any");
  const [snoozed, setSnoozed] = React.useState<"hide" | "show" | "only">("hide");
  const [assigned, setAssigned] = React.useState<"any" | "me" | "none">("any");
  const [sort, setSort] = React.useState<"recent" | "oldest">("recent");
  const [me, setMe] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState<Record<string, boolean>>({});
  const prefsReady = React.useRef(false);

  React.useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const r = await fetch("/api/me");
        const j = await r.json();
        if (!canceled) {
          setMe(j?.user_id ?? null);
        }
      } catch {
        if (!canceled) {
          setMe(null);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  React.useEffect(() => {
    prefsReady.current = false;
    let canceled = false;
    (async () => {
      try {
        const response = await fetch("/api/my/inbox-filters");
        const json = await response.json();
        if (canceled) return;
        const f = (json?.inbox_filters ?? {}) as Partial<{
          q: string;
          needs: typeof needs;
          snoozed: typeof snoozed;
          assigned: typeof assigned;
          sort: typeof sort;
        }>;
        if (typeof f.q === "string") setQ(f.q);
        if (f.needs && ["any", "true", "false"].includes(f.needs)) {
          setNeeds(f.needs);
        }
        if (f.snoozed && ["hide", "show", "only"].includes(f.snoozed)) {
          setSnoozed(f.snoozed);
        }
        if (f.assigned && ["any", "me", "none"].includes(f.assigned)) {
          setAssigned(f.assigned);
        }
        if (f.sort && ["recent", "oldest"].includes(f.sort)) {
          setSort(f.sort);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!canceled) {
          prefsReady.current = true;
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [campaignId]);

  React.useEffect(() => {
    let canceled = false;
    async function loadOnline() {
      try {
        const j = await fetch("/api/presence/online").then((r) => r.json());
        if (canceled) return;
        const map: Record<string, boolean> = {};
        for (const u of j.online ?? []) {
          if (u?.user_id) {
            map[u.user_id] = true;
          }
        }
        setOnline(map);
      } catch {
        if (!canceled) {
          setOnline({});
        }
      }
    }
    loadOnline();
    const id = setInterval(loadOnline, 30_000);
    return () => {
      canceled = true;
      clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, q, needs, snoozed, assigned, sort]);

  async function load() {
    const url = new URL(`/api/campaign/${campaignId}/inbox/list`, window.location.origin);
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("needs", needs);
    url.searchParams.set("snoozed", snoozed);
    url.searchParams.set("assigned", assigned);
    url.searchParams.set("sort", sort);
    const j = await fetch(url.toString()).then((r) => r.json());
    setRows(j.items ?? []);
    setSelected({});
  }

  function allIds() {
    return rows.map((r) => r.id);
  }

  function selectedIds() {
    return Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = {};
    if (checked) for (const r of rows) next[r.id] = true;
    setSelected(next);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [id]: checked }));
  }

  async function bulk(
    action: "mark_done" | "mark_needs_reply" | "snooze" | "unsnooze" | "assign" | "unassign",
    extra?: { until?: string; user_id?: string },
  ) {
    const ids = selectedIds();
    if (!ids.length) return;
    await fetch(`/api/campaign/${campaignId}/inbox/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action, ...extra }),
    });
    await load();
  }

  React.useEffect(() => {
    if (!prefsReady.current) return;
    const id = setTimeout(() => {
      void fetch("/api/my/inbox-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, needs, snoozed, assigned, sort }),
      });
    }, 500);
    return () => clearTimeout(id);
  }, [q, needs, snoozed, assigned, sort]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      const ids = selectedIds();
      if (!ids.length) return;
      const key = e.key.toLowerCase();
      if (key === "m") bulk("mark_done");
      if (key === "n") bulk("mark_needs_reply");
      if (key === "s") {
        const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        bulk("snooze", { until });
      }
      if (key === "u") bulk("unsnooze");
      if (key === "a") bulk("assign", { user_id: me ?? undefined });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, campaignId, me]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xl font-semibold">Replies Inbox</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <input
            className="rounded-md border p-2 text-sm md:col-span-2"
            placeholder="Search name, company, email, or thread…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded-md border p-2 text-sm"
            value={needs}
            onChange={(e) => setNeeds(e.target.value as typeof needs)}
          >
            <option value="any">Needs: Any</option>
            <option value="true">Needs: Yes</option>
            <option value="false">Needs: No</option>
          </select>
          <select
            className="rounded-md border p-2 text-sm"
            value={snoozed}
            onChange={(e) => setSnoozed(e.target.value as typeof snoozed)}
          >
            <option value="hide">Snoozed: Hide</option>
            <option value="show">Snoozed: Show</option>
            <option value="only">Snoozed: Only</option>
          </select>
          <select
            className="rounded-md border p-2 text-sm"
            value={assigned}
            onChange={(e) => setAssigned(e.target.value as typeof assigned)}
          >
            <option value="any">Assigned: Any</option>
            <option value="me" disabled={!me}>
              Assigned: Me
            </option>
            <option value="none">Assigned: None</option>
          </select>
          <select
            className="rounded-md border p-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="recent">Sort: Recent</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border p-2">
        <Checkbox
          checked={selectedIds().length === allIds().length && allIds().length > 0}
          onCheckedChange={(v) => toggleAll(Boolean(v))}
        />
        <div className="text-sm">Selected: {selectedIds().length}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => bulk("mark_done")} title="M">
            Mark done (M)
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulk("mark_needs_reply")} title="N">
            Needs reply (N)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulk("snooze", { until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })}
            title="S"
          >
            Snooze 24h (S)
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulk("unsnooze")} title="U">
            Unsnooze (U)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulk("assign", { user_id: me ?? undefined })}
            title="A"
            disabled={!me}
          >
            Assign to me (A)
          </Button>
          <Button variant="outline" size="sm" onClick={() => bulk("unassign")}>
            Unassign
          </Button>
        </div>
      </div>

      <div className="divide-y rounded-2xl border">
        <div className="grid grid-cols-12 p-2 text-xs text-muted-foreground">
          <div className="col-span-1" />
          <div className="col-span-5">Lead / Thread</div>
          <div className="col-span-2">Last inbound</div>
          <div className="col-span-2">Snooze</div>
          <div className="col-span-2">Status</div>
        </div>
        {rows.map((r) => {
          const snoozedActive = !!r.snoozed_until && new Date(r.snoozed_until).getTime() > Date.now();
          return (
            <div key={r.id} className="grid grid-cols-12 items-center gap-2 p-3">
              <div className="col-span-1">
                <Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => toggleOne(r.id, Boolean(v))} />
              </div>
              <div className="col-span-5">
                <Link href={`/campaign/${campaignId}/inbox/${r.id}`} className="font-medium">
                  {r.lead_name || r.lead_email || `Lead ${r.lead_id.slice(0, 8)}…`}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {r.lead_company ? `${r.lead_company} • ` : ""}
                  {r.lead_email ?? ""}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.last_inbound_label && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]">
                      {r.last_inbound_label}
                    </span>
                  )}
                  {r.assigned_to ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${
                        online[r.assigned_to] ? "border-green-500" : ""
                      }`}
                    >
                      {online[r.assigned_to] ? "Assigned • Online" : "Assigned • Offline"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]">
                      Unassigned
                    </span>
                  )}
                </div>
              </div>
              <div className="col-span-2 text-sm">
                {r.last_inbound_at ? new Date(r.last_inbound_at).toLocaleString() : "—"}
              </div>
              <div className="col-span-2 text-sm">
                {snoozedActive ? `Until ${new Date(r.snoozed_until!).toLocaleString()}` : "—"}
              </div>
              <div className="col-span-2 text-sm">
                {r.needs_reply && !r.replied_at ? (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Needs reply</span>
                ) : r.replied_at ? (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Replied</span>
                ) : (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Done</span>
                )}
                {snoozedActive && (
                  <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Snoozed</span>
                )}
              </div>
            </div>
          );
        })}
        {!rows.length && <div className="p-6 text-sm text-muted-foreground">Inbox is clear. 🎯</div>}
      </div>
    </div>
  );
}

