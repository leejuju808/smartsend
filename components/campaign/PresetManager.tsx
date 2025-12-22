"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Preset = {
  id: string;
  name: string;
  scenario: string;
  tone: string;
  subject: string;
  body: string;
  is_active: boolean;
  sort_order: number;
};

const SCENARIOS = ["no_reply", "question", "positive", "neutral", "routing"];
const TONES = ["professional", "friendly", "concise", "assertive"];

export default function PresetManager({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [presets, setPresets] = React.useState<Preset[]>([]);
  const [editing, setEditing] = React.useState<Preset | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaign/${campaignId}/nudge/presets`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setPresets(j.presets || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load presets");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createPreset() {
    const r = await fetch(`/api/campaign/${campaignId}/nudge/presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New preset",
        sort_order: (presets.at(-1)?.sort_order ?? 0) + 10,
      }),
    });
    const j = await r.json();
    if (j.ok) {
      toast.success("Preset created");
      setEditing(j.preset);
      load();
    } else {
      toast.error("Create failed");
    }
  }

  async function savePreset(p: Preset) {
    const r = await fetch(`/api/nudge-preset/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
    const j = await r.json();
    if (j.ok) {
      toast.success("Saved");
      setEditing(null);
      load();
    } else {
      toast.error("Save failed");
    }
  }

  async function deletePreset(id: string) {
    if (!confirm("Delete this preset?")) return;
    const r = await fetch(`/api/nudge-preset/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) {
      toast.success("Deleted");
      load();
    } else {
      toast.error("Delete failed");
    }
  }

  const [dragId, setDragId] = React.useState<string | null>(null);

  function onDragStart(id: string) {
    setDragId(id);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>, overId: string) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setPresets((prev) => {
      const a = [...prev];
      const from = a.findIndex((x) => x.id === dragId);
      const to = a.findIndex((x) => x.id === overId);
      if (from === -1 || to === -1) return prev;
      const [m] = a.splice(from, 1);
      a.splice(to, 0, m);
      return a;
    });
  }

  async function onDragEnd() {
    if (!dragId) return;
    setDragId(null);
    const items = presets.map((p, i) => ({ id: p.id, sort_order: (i + 1) * 10 }));
    await fetch(`/api/campaign/${campaignId}/nudge/presets/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    load();
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Preset Manager</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" onClick={createPreset}>
            New preset
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
          <div>Drag to reorder · Click to edit</div>
          <div>{presets.length} presets</div>
        </div>
        <div>
          {presets.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No presets yet.</div>
          ) : (
            presets.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => onDragStart(p.id)}
                onDragOver={(e) => onDragOver(e, p.id)}
                onDragEnd={onDragEnd}
                className="flex items-center justify-between gap-3 border-b px-3 py-2 hover:bg-muted/30"
              >
                <button onClick={() => setEditing(p)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <div className="cursor-grab select-none pr-1">⋮⋮</div>
                    <div className="font-medium">{p.name}</div>
                    {!p.is_active && (
                      <span className="text-[10px] uppercase text-amber-600">Inactive</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.scenario} · {p.tone} — {p.subject || "(no subject)"}
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.is_active}
                    onCheckedChange={async (v) => {
                      await fetch(`/api/nudge-preset/${p.id}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ is_active: v }),
                      });
                      load();
                    }}
                  />
                  <Button size="sm" variant="destructive" onClick={() => deletePreset(p.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

  {editing && (
        <Editor preset={editing} onClose={() => setEditing(null)} onSave={savePreset} />
      )}
    </div>
  );
}

function Editor({
  preset,
  onSave,
  onClose,
}: {
  preset: Preset;
  onSave: (p: Preset) => void;
  onClose: () => void;
}) {
  const [p, setP] = React.useState<Preset>(preset);

  React.useEffect(() => {
    setP(preset);
  }, [preset]);

  function renderPreviewBody(raw: string) {
    return (raw || "")
      .replaceAll("{lead_first}", "Alex")
      .replaceAll("{company}", "Acme Co.")
      .replaceAll("{booking_link}", "https://cal.com/you/intro")
      .replaceAll("{me}", "SmartSend")
      .replaceAll("{duration}", "30")
      .replaceAll("{last_msg}", "")
      .replaceAll("{cta}", "Open to a quick intro?");
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Edit preset</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => onSave(p)}>
            Save
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground">Name</div>
            <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Scenario</div>
              <select
                className="w-full rounded border px-2 py-1 text-sm"
                value={p.scenario}
                onChange={(e) => setP({ ...p, scenario: e.target.value })}
              >
                {SCENARIOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tone</div>
              <select
                className="w-full rounded border px-2 py-1 text-sm"
                value={p.tone}
                onChange={(e) => setP({ ...p, tone: e.target.value })}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Subject</div>
            <Input value={p.subject} onChange={(e) => setP({ ...p, subject: e.target.value })} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Body</div>
            <Textarea
              rows={10}
              value={p.body}
              onChange={(e) => setP({ ...p, body: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={p.is_active} onCheckedChange={(v) => setP({ ...p, is_active: v })} />
              <span className="text-sm">Active</span>
            </div>
            <div className="w-28">
              <div className="text-xs text-muted-foreground">Sort</div>
              <Input
                type="number"
                value={p.sort_order}
                onChange={(e) =>
                  setP({ ...p, sort_order: Number.parseInt(e.target.value || "0", 10) })
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-md border bg-muted/40 p-2">
            <div className="mb-1 text-xs text-muted-foreground">Preview (tokens stubbed)</div>
            <div className="text-sm">
              <b>Subject:</b> {p.subject || "(no subject)"}{" "}
            </div>
            <pre className="mt-1 whitespace-pre-wrap text-sm">{renderPreviewBody(p.body)}</pre>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Tokens: {"{lead_first}"}, {"{company}"}, {"{booking_link}"}, {"{cta}"}, {"{duration}"}…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


