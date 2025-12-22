"use client";

import { useEffect, useState } from "react";

type Props = { 
  selected: string[]; 
  campaignId?: string;
  onDone?: () => void;
};

const LABELS = ["positive", "neutral", "negative", "unsubscribe", "ooo", "bounce", "other"] as const;

type Assignee = {
  id: string;
  role: string;
  profile?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
  email?: string | null;
  name?: string | null;
};

export function BulkBar({ selected, campaignId, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  // Load assignees for current campaign context
  useEffect(() => {
    async function load() {
      if (!campaignId) return;
      try {
        const r = await fetch(`/api/campaigns/${campaignId}/members`);
        if (r.ok) {
          const j = await r.json();
          // Filter to only owner/editor roles
          const members = (j.members || j || []).filter((m: any) => 
            m.role === 'owner' || m.role === 'editor'
          );
          setAssignees(members.map((m: any) => ({
            id: m.user_id || m.id,
            role: m.role,
            profile: m.profile || null,
            email: m.email || m.profile?.email || null,
            name: m.name || m.profile?.name || m.profile?.full_name || null,
          })));
        }
      } catch (e) {
        console.error('Failed to load assignees:', e);
      }
    }
    load();
  }, [campaignId]);

  async function call(body: any) {
    setBusy(true);
    try {
      const res = await fetch("/api/inbox/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, thread_ids: selected }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Bulk action failed");
      if (onDone) {
        onDone();
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      alert(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2 bg-muted/50">
      <div className="text-xs">{selected.length} selected</div>

      <button
        className="text-xs border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
        disabled={busy}
        onClick={() => call({ action: "close" })}
      >
        Close
      </button>

      <button
        className="text-xs border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
        disabled={busy}
        onClick={() => call({ action: "reopen" })}
      >
        Reopen
      </button>

      {/* Assign */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Assign</span>
        <select
          className="text-xs border rounded px-2 py-1"
          disabled={busy || assignees.length === 0}
          onChange={(e) => {
            const val = e.target.value || "";
            if (val === "__unassign__") call({ action: "assign", user_id: null });
            else if (val) call({ action: "assign", user_id: val });
            e.currentTarget.selectedIndex = 0;
          }}
        >
          <option value="">Select…</option>
          <option value="__unassign__">Unassign</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>
              {(a.name || a.profile?.full_name || a.email || a.profile?.email || a.id) + 
               (a.role === "owner" ? " (owner)" : "")}
            </option>
          ))}
        </select>
      </div>

      {/* Labels */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Label</span>
        <select
          className="text-xs border rounded px-2 py-1"
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value || "";
            if (v === "__clear__") call({ action: "clear_label" });
            else if (v) call({ action: "apply_label", label: v });
            e.currentTarget.selectedIndex = 0;
          }}
        >
          <option value="">Set…</option>
          <option value="__clear__">Clear label</option>
          {LABELS.map(l => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

