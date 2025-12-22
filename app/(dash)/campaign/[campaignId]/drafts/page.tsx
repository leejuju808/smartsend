"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  lead_id: string | null;
  thread_id: string | null;
  subject: string | null;
  body: string | null;
  headers: Record<string, unknown> | null;
  queued_at: string | null;
  updated_at: string | null;
  provider: string | null;
  account_id: string | null;
  source: string | null;
};

export default function DraftsPage() {
  const { campaignId } = useParams() as { campaignId: string };
  const [rows, setRows] = React.useState<Row[]>([]);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [editSubject, setEditSubject] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [editTo, setEditTo] = React.useState("");

  async function load() {
    const u = new URL(`/api/campaign/${campaignId}/drafts`, window.location.origin);
    if (q) u.searchParams.set("q", q);
    const response = await fetch(u);
    if (!response.ok) {
      console.error("Failed to load drafts", await response.text());
      return;
    }
    const json = await response.json();
    setRows(json.items ?? []);
    setSelected({});
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, q]);

  function selectedIds() {
    return Object.entries(selected)
      .filter(([, value]) => value)
      .map(([id]) => id);
  }

  async function approve(ids?: string[]) {
    const payload = { ids: ids && ids.length ? ids : selectedIds() };
    if (!payload.ids.length) return;
    await fetch(`/api/campaign/${campaignId}/drafts/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await load();
  }

  async function removeDrafts() {
    const ids = selectedIds();
    if (!ids.length) return;
    await fetch(`/api/campaign/${campaignId}/drafts/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await load();
  }

  function openEdit(row: Row) {
    setEditing(row);
    setEditSubject(row.subject ?? "");
    setEditBody(row.body ?? "");
    setEditTo((row.headers as { to?: string } | null)?.to ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    await fetch(`/api/drafts/${editing.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        subject: editSubject,
        body: editBody,
        to: editTo,
      }),
    });
    setEditing(null);
    await load();
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Drafts</div>
        <div className="flex gap-2">
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="Search subject/body/to…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => approve()}>
            Approve & Queue
          </Button>
          <Button size="sm" variant="outline" onClick={removeDrafts}>
            Delete
          </Button>
        </div>
      </div>

      <div className="divide-y rounded-2xl border">
        <div className="grid grid-cols-12 p-2 text-xs text-muted-foreground">
          <div className="col-span-1" />
          <div className="col-span-4">Subject / To</div>
          <div className="col-span-4">Preview</div>
          <div className="col-span-1">Source</div>
          <div className="col-span-2">Actions</div>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-12 items-center gap-2 p-3">
            <div className="col-span-1">
              <input
                type="checkbox"
                checked={!!selected[row.id]}
                onChange={(event) =>
                  setSelected((prev) => ({
                    ...prev,
                    [row.id]: event.target.checked,
                  }))
                }
              />
            </div>
            <div className="col-span-4">
              <div className="truncate font-medium">{row.subject ?? "(no subject)"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {(row.headers as { to?: string } | null)?.to ?? "—"}
              </div>
            </div>
            <div className="col-span-4 truncate text-sm">{row.body?.slice(0, 160) ?? "—"}</div>
            <div className="col-span-1 text-xs">{row.source ?? "manual"}</div>
            <div className="col-span-2 flex gap-2">
              {row.thread_id ? (
                <Link
                  href={`/campaign/${campaignId}/inbox/${row.thread_id}`}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  Open thread
                </Link>
              ) : null}
              <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => openEdit(row)}
              >
                Edit
              </button>
              <button
                className="rounded-md border px-2 py-1 text-xs"
                onClick={() => approve([row.id])}
              >
                Approve
              </button>
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="p-6 text-sm text-muted-foreground">No drafts. 🎯</div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-2xl space-y-3 rounded-2xl bg-white p-4">
            <div className="text-lg font-semibold">Edit Draft</div>
            <div className="grid gap-2">
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="To"
                value={editTo}
                onChange={(event) => setEditTo(event.target.value)}
              />
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="Subject"
                value={editSubject}
                onChange={(event) => setEditSubject(event.target.value)}
              />
              <textarea
                className="h-48 rounded-md border p-2 text-sm"
                placeholder="Body"
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="rounded-md border px-3 py-2 text-sm" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



