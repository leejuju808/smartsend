"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Variant = {
  id: string;
  name: string;
  weight: number;
  subject?: string | null;
  body: string;
  is_html: boolean;
  active: boolean;
  notes?: string | null;
};

const VAR_RX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const KNOWN_SINGLE = new Set([
  "first_name",
  "last_name",
  "company",
  "title",
  "city",
  "state",
  "email",
  "name",
  "unsubscribe_link",
  "unsubscribe_url",
  "sender_name",
  "sender_email",
]);
const KNOWN_PREFIXES = [
  "lead.",
  "campaign.",
  "account.",
  "sender.",
  "workspace.",
  "org.",
  "user.",
];

function extractVars(text: string | null | undefined) {
  if (!text) return [];
  const set = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = VAR_RX.exec(text))) {
    set.add(match[1]);
  }
  return Array.from(set);
}

function findUnknownVars(variant: Variant | null) {
  if (!variant) return [];
  const vars = new Set<string>();
  extractVars(variant.subject).forEach((v) => vars.add(v));
  extractVars(variant.body).forEach((v) => vars.add(v));
  return Array.from(vars).filter(
    (v) =>
      !KNOWN_SINGLE.has(v) &&
      !KNOWN_PREFIXES.some((prefix) => v.startsWith(prefix))
  );
}

export default function StepVariantsPage() {
  const { campaignId, stepId } = useParams() as { campaignId: string; stepId: string };
  const [rows, setRows] = React.useState<Variant[]>([]);
  const [metrics, setMetrics] = React.useState<any[]>([]);
  const [editing, setEditing] = React.useState<Variant | null>(null);
  const [genOpen, setGenOpen] = React.useState(false);
  const [goal, setGoal] = React.useState(
    "Short, friendly opener with one clear CTA to book a 15-min call."
  );
  const [n, setN] = React.useState(3);
  const [insert, setInsert] = React.useState(true);
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [guard, setGuard] = React.useState<any>(null);
  const [events, setEvents] = React.useState<any[]>([]);
  const [guardLoading, setGuardLoading] = React.useState(false);
  const [simulateLoading, setSimulateLoading] = React.useState(false);

  async function load() {
    const v = await fetch(`/api/step/${stepId}/variants`).then((r) => r.json());
    setRows(v.items ?? []);
    const m = await fetch(`/api/step/${stepId}/variants/metrics`).then((r) => r.json());
    setMetrics(m.items ?? []);
  }

  async function loadGuard() {
    if (!campaignId) return;
    setGuardLoading(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/guard`);
      const json = await res.json();
      setGuard(json.item ?? null);
      setEvents(json.events ?? []);
    } finally {
      setGuardLoading(false);
    }
  }

  async function loadJobs() {
    const j = await fetch(`/api/step/${stepId}/rewrite`).then((r) => r.json());
    setJobs(j.items ?? []);
  }

  React.useEffect(() => {
    load();
    loadJobs();
    loadGuard();
  }, [stepId, campaignId]);

  function openNew() {
    setEditing({
      id: "",
      name: "A",
      weight: 1,
      subject: "",
      body: "Hi {{lead.first_name}} — …",
      is_html: false,
      active: true,
    });
  }

  async function save() {
    if (!editing) return;
    await fetch(`/api/step/${stepId}/variants/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setEditing(null);
    load();
  }

  const editingUnknownVars = React.useMemo(() => findUnknownVars(editing), [editing]);
  const levelColor = React.useCallback((level: string) => {
    if (level === "paused") return "text-red-600";
    if (level === "warn") return "text-amber-600";
    if (level === "resume") return "text-emerald-600";
    return "text-muted-foreground";
  }, []);

  async function updateGuard(values: Record<string, any>) {
    if (!campaignId) return;
    const payload: Record<string, any> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "number" && Number.isNaN(value)) continue;
      payload[key] = value;
    }
    if (!Object.keys(payload).length) return;
    await fetch(`/api/campaign/${campaignId}/guard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await loadGuard();
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Step Variants</div>
        <Button onClick={openNew}>New Variant</Button>
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Deliverability Guard</div>
          <label className="text-sm inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!guard?.enabled}
              disabled={guardLoading}
              onChange={async (e) => {
                await updateGuard({ enabled: e.target.checked });
              }}
            />{" "}
            Enabled
          </label>
        </div>
        {guardLoading && <div className="text-xs text-muted-foreground">Loading guard settings…</div>}
        {guard && !guardLoading && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Window (days)</div>
                <input
                  type="number"
                  min={3}
                  max={30}
                  className="w-full rounded-md border p-2"
                  value={guard.window_days}
                  onChange={async (e) => {
                    await updateGuard({ window_days: Number(e.target.value) });
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Min Sends</div>
                <input
                  type="number"
                  min={10}
                  className="w-full rounded-md border p-2"
                  value={guard.min_sends}
                  onChange={async (e) => {
                    await updateGuard({ min_sends: Number(e.target.value) });
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Max Bounce %</div>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={100}
                  className="w-full rounded-md border p-2"
                  value={Math.round((guard.max_bounce_rate ?? 0) * 1000) / 10}
                  onChange={async (e) => {
                    await updateGuard({ max_bounce_rate: Number(e.target.value) / 100 });
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Min Open %</div>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={100}
                  className="w-full rounded-md border p-2"
                  value={Math.round((guard.min_open_rate ?? 0) * 1000) / 10}
                  onChange={async (e) => {
                    await updateGuard({ min_open_rate: Number(e.target.value) / 100 });
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Min Reply %</div>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={100}
                  className="w-full rounded-md border p-2"
                  value={Math.round((guard.min_reply_rate ?? 0) * 1000) / 10}
                  onChange={async (e) => {
                    await updateGuard({ min_reply_rate: Number(e.target.value) / 100 });
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cooldown (hours)</div>
                <input
                  type="number"
                  min={1}
                  max={72}
                  className="w-full rounded-md border p-2"
                  value={guard.cool_hours}
                  onChange={async (e) => {
                    await updateGuard({ cool_hours: Number(e.target.value) });
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Variant Action</div>
                <select
                  className="w-full rounded-md border p-2"
                  value={guard.action_on_variant}
                  onChange={async (e) => {
                    await updateGuard({ action_on_variant: e.target.value });
                  }}
                >
                  <option value="pause">Pause</option>
                  <option value="warn">Warn</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Step Action</div>
                <select
                  className="w-full rounded-md border p-2"
                  value={guard.action_on_step}
                  onChange={async (e) => {
                    await updateGuard({ action_on_step: e.target.value });
                  }}
                >
                  <option value="pause">Pause</option>
                  <option value="warn">Warn</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Account Action</div>
                <select
                  className="w-full rounded-md border p-2"
                  value={guard.action_on_account}
                  onChange={async (e) => {
                    await updateGuard({ action_on_account: e.target.value });
                  }}
                >
                  <option value="pause">Pause</option>
                  <option value="warn">Warn</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={async () => {
                    if (!campaignId) return;
                    try {
                      setSimulateLoading(true);
                      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
                      if (!base) {
                        alert("Supabase URL not configured.");
                        return;
                      }
                      const resp = await fetch(
                        `${base}/functions/v1/deliverability-guard?campaignId=${campaignId}&simulate=1`,
                        { method: "POST" }
                      );
                      const json = await resp.json();
                      if (!resp.ok) {
                        alert("Simulation failed:\n" + JSON.stringify(json, null, 2));
                        return;
                      }
                      alert("Simulation:\n" + JSON.stringify(json.actions, null, 2));
                    } finally {
                      setSimulateLoading(false);
                    }
                  }}
                  disabled={simulateLoading}
                >
                  {simulateLoading ? "Running…" : "Run Check Now"}
                </button>
                <button
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={loadGuard}
                  disabled={guardLoading}
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Recent guard events
              </div>
              {events.length ? (
                events.slice(0, 5).map((ev) => (
                  <div key={ev.id} className="flex items-start justify-between text-xs rounded-md border p-2">
                    <div>
                      <div className={`font-medium ${levelColor(ev.level)}`}>{ev.level}</div>
                      <div className="text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-sm max-w-[60%]">
                      <div className="text-muted-foreground uppercase tracking-wide">
                        {ev.entity_type}
                      </div>
                      <div>{ev.reason}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No guard activity yet.</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Smart Template Rewriter</div>
          <Button variant="outline" onClick={() => setGenOpen(true)}>
            Generate with AI
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Seeded by your recent top-performing variants; safely inserts drafts (weight 5) unless you disable insert.
        </div>
        <div className="mt-3">
          <div className="mb-1 text-sm font-medium">Recent rewrite jobs</div>
          <div className="divide-y text-sm">
            {jobs.map((j) => (
              <div key={j.id} className="flex justify-between py-1">
                <div>
                  {new Date(j.created_at).toLocaleString()} —{" "}
                  {j.goal?.slice(0, 60) || "(no goal)"}
                  {j.goal?.length > 60 ? "…" : ""}
                </div>
                <div className={j.status === "success" ? "text-green-600" : "text-muted-foreground"}>
                  {j.status}
                </div>
              </div>
            ))}
            {!jobs.length && (
              <div className="py-1 text-sm text-muted-foreground">No jobs yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="font-medium mb-2">Performance</div>
        <div className="grid grid-cols-7 text-xs text-muted-foreground px-2">
          <div>Name</div>
          <div>Sends</div>
          <div>Opens</div>
          <div>Open %</div>
          <div>Clicks</div>
          <div>Click %</div>
          <div>Replies • Reply %</div>
        </div>
        <div className="divide-y">
          {metrics.map((m) => (
            <div key={m.variant_id} className="grid grid-cols-7 items-center px-2 py-2 text-sm">
              <div>{m.name}</div>
              <div>{m.sends}</div>
              <div>{m.opens}</div>
              <div>{m.open_rate}%</div>
              <div>{m.clicks}</div>
              <div>{m.click_rate}%</div>
              <div>
                {m.replies} • {m.reply_rate}%
              </div>
            </div>
          ))}
          {!metrics.length && (
            <div className="text-sm text-muted-foreground py-2">No data yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border divide-y">
        <div className="p-2 grid grid-cols-12 text-xs text-muted-foreground">
          <div className="col-span-2">Name</div>
          <div className="col-span-1">Weight</div>
          <div className="col-span-1">Active</div>
          <div className="col-span-4">Subject</div>
          <div className="col-span-4">Preview</div>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="p-3 grid grid-cols-12 items-center gap-2">
            <div className="col-span-2">{r.name}</div>
            <div className="col-span-1">{r.weight}</div>
            <div className="col-span-1 space-y-1">
              <div>{r.active ? "On" : "Off"}</div>
              {!r.active && r.notes?.includes("auto-paused") && (
                <div className="rounded bg-red-100 text-red-700 text-[10px] px-2 py-1 text-center">
                  Paused by Guard
                </div>
              )}
            </div>
            <div className="col-span-4 truncate">{r.subject || "(no subject)"}</div>
            <div className="col-span-4 truncate">{r.body.slice(0, 120)}</div>
            <div className="col-span-12 mt-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                Edit
              </Button>
              {!r.active && (
                <button
                  className="ml-2 rounded-md border px-3 py-1 text-xs"
                  onClick={async () => {
                    await fetch(`/api/variant/${r.id}/resume`, { method: "POST" });
                    await load();
                    await loadGuard();
                  }}
                >
                  Resume
                </button>
              )}
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="p-6 text-sm text-muted-foreground">No variants yet.</div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-4 w-full max-w-2xl space-y-3">
            <div className="text-lg font-semibold">
              {editing.id ? "Edit Variant" : "New Variant"}
            </div>
            {editingUnknownVars.length > 0 && (
              <div className="text-xs text-amber-600">
                Unknown variables: {editingUnknownVars.join(", ")} — check placeholders before saving.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input
                className="rounded-md border p-2 text-sm"
                placeholder="Name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <input
                type="number"
                min={0}
                className="rounded-md border p-2 text-sm"
                placeholder="Weight"
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: Number(e.target.value) })}
              />
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Active
              </label>
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.is_html}
                  onChange={(e) => setEditing({ ...editing, is_html: e.target.checked })}
                />
                HTML body
              </label>
              <input
                className="col-span-2 rounded-md border p-2 text-sm"
                placeholder="Subject (optional)"
                value={editing.subject ?? ""}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
              <textarea
                className="col-span-2 rounded-md border p-2 text-sm h-48"
                placeholder="Body (supports {{lead.first_name}} etc.)"
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="rounded-md border px-3 py-2 text-sm" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {genOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-4 w-full max-w-xl space-y-3">
            <div className="text-lg font-semibold">Generate Variants</div>
            <textarea
              className="w-full rounded-md border p-2 text-sm h-28"
              placeholder="Goal (tone, CTA, constraints)"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <label className="text-sm">How many</label>
              <input
                type="number"
                min={1}
                max={6}
                className="rounded-md border p-2 text-sm w-20"
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
              />
              <label className="ml-auto inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={insert}
                  onChange={(e) => setInsert(e.target.checked)}
                />
                Insert as drafts (weight 5)
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setGenOpen(false)}>
                Cancel
              </button>
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={async () => {
                  await fetch(`/api/step/${stepId}/rewrite`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ goal, n, insert }),
                  });
                  setGenOpen(false);
                  await load();
                  await loadJobs();
                }}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

