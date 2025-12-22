"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Variant = { subject: string; html: string; why?: string };
type Preset = {
  id: string;
  name: string;
  tone: string;
  goal: string;
  length: string;
  cta?: string | null;
  extra?: any;
};
type Stat = {
  window: "7d" | "30d";
  campaign_id: string | null;
  preset_id: string | null;
  tone: string;
  goal: string;
  length: string;
  source: string;
  open_rate: number;
  reply_rate: number;
  sends: number;
  updated_at: string;
};

export function RewritePanel({
  subject,
  body,
  onPick,
  campaignId,
  threadId,
  draftId,
}: {
  subject: string;
  body: string;
  onPick: (v: Variant) => void;
  campaignId?: string;
  threadId?: string;
  draftId?: string;
}) {
  const [tone, setTone] = React.useState("professional");
  const [goal, setGoal] = React.useState("book_meeting");
  const [length, setLength] = React.useState("short");
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [offer, setOffer] = React.useState("");
  const [cta, setCta] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [presets, setPresets] = React.useState<Preset[]>([]);
  const [presetId, setPresetId] = React.useState<string>("");
  const [stats, setStats] = React.useState<Stat[]>([]);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");

  React.useEffect(() => {
    loadPresets();
  }, []);

  React.useEffect(() => {
    loadStats();
  }, []);

  async function loadPresets() {
    try {
      const r = await fetch("/api/rewrite/presets", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error ?? "Failed to load presets");
        return;
      }
      setPresets(j?.presets ?? []);
    } catch (err: any) {
      toast.error(String(err?.message ?? err ?? "Failed to load presets"));
    }
  }

  function statForPreset(id?: string | null) {
    if (!id) {
      return null;
    }
    const pick = (w: "7d" | "30d") =>
      stats.find((s) => s.window === w && s.preset_id === id && s.source === "composer") ??
      stats.find((s) => s.window === w && s.preset_id === id);
    return pick("7d") ?? pick("30d") ?? null;
  }

  function statForCombo(t: string, g: string, l: string) {
    const pick = (w: "7d" | "30d") =>
      stats.find(
        (s) => s.window === w && s.tone === t && s.goal === g && s.length === l && s.source === "composer",
      ) ??
      stats.find((s) => s.window === w && s.tone === t && s.goal === g && s.length === l);
    return pick("7d") ?? pick("30d") ?? null;
  }

  async function loadStats(preset?: string) {
    try {
      const qs = preset ? `?preset_id=${preset}` : "";
      const r = await fetch(`/api/rewrite/presets/stats${qs}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error ?? "Failed to load preset stats");
        return;
      }
      const next = Array.isArray(j?.stats) ? j.stats : [];
      if (preset) {
        setStats((prev) => {
          const retained = prev.filter((s) => s.preset_id !== preset);
          return [...retained, ...next];
        });
      } else {
        setStats(next);
      }
    } catch (err: any) {
      toast.error(String(err?.message ?? err ?? "Failed to load preset stats"));
    }
  }

  function applyPreset(id: string) {
    setPresetId(id);
    if (!id) {
      loadStats();
      return;
    }
    const preset = presets.find((p) => p.id === id);
    if (!preset) {
      return;
    }
    setTone(preset.tone);
    setGoal(preset.goal);
    setLength(preset.length);
    setCta(preset.cta ?? "");
    loadStats(id);
  }

  async function savePreset() {
    const trimmed = presetName.trim();
    if (!trimmed) {
      toast.error("Name required");
      return;
    }
    try {
      const bodyPayload = {
        name: trimmed,
        tone,
        goal,
        length,
        cta,
        campaign_id: campaignId ?? null,
        extra: {},
      };
      const r = await fetch("/api/rewrite/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error ?? "Failed to save preset");
        return;
      }
      toast.success("Preset saved");
      setSaveOpen(false);
      setPresetName("");
      loadPresets();
    } catch (err: any) {
      toast.error(String(err?.message ?? err ?? "Failed to save preset"));
    }
  }

  async function run() {
    try {
      setLoading(true);
      setVariants([]);
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          body_html: body,
          tone,
          goal,
          length,
          variants: 3,
          context: { offer, cta },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? "Rewrite failed");
        return;
      }
      setVariants(j.variants ?? []);
    } catch (err: any) {
      toast.error(String(err?.message ?? err ?? "Rewrite failed"));
    } finally {
      setLoading(false);
    }
  }

  async function pick(v: Variant) {
    onPick(v);
    await fetch("/api/rewrite/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "composer",
        campaign_id: campaignId,
        thread_id: threadId,
        draft_id: draftId,
        preset_id: presetId || null,
        tone,
        goal,
        length,
        picked: true,
      }),
    }).catch(() => {});
    toast.success("Variant applied");
  }

  const currentStat = presetId ? statForPreset(presetId) : statForCombo(tone, goal, length);

  return (
    <div className="border rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Select value={presetId} onValueChange={applyPreset}>
          <SelectTrigger className="w-64" disabled={loading}>
            <SelectValue placeholder="Choose preset…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— None —</SelectItem>
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                <div className="flex items-center gap-1">
                  <span>
                    {preset.name} · {preset.tone}/{preset.goal}/{preset.length}
                  </span>
                  {(() => {
                    const ps = statForPreset(preset.id) ?? statForCombo(preset.tone, preset.goal, preset.length);
                    if (!ps) {
                      return null;
                    }
                    return (
                      <span className="ml-1 text-xs text-emerald-400">
                        🔥 {ps.reply_rate}% / {ps.window}
                      </span>
                    );
                  })()}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">Save current as preset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save preset</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <div className="grid gap-1">
                <Label htmlFor="presetName">Name</Label>
                <Input
                  id="presetName"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g., Warm nudge · short"
                />
              </div>
              <div className="grid gap-1">
                <Label>Current settings</Label>
                <div className="text-sm text-muted-foreground">
                  {tone} / {goal} / {length}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={savePreset}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select value={tone} onValueChange={setTone} disabled={loading}>
          <SelectTrigger disabled={loading}>
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            {["friendly", "professional", "concise", "assertive", "warm"].map(
              (t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={goal} onValueChange={setGoal} disabled={loading}>
          <SelectTrigger disabled={loading}>
            <SelectValue placeholder="Goal" />
          </SelectTrigger>
          <SelectContent>
            {["book_meeting", "nudge", "qualify", "followup", "intro"].map(
              (g) => (
                <SelectItem key={g} value={g}>
                  {g.replace("_", " ")}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={length} onValueChange={setLength} disabled={loading}>
          <SelectTrigger disabled={loading}>
            <SelectValue placeholder="Length" />
          </SelectTrigger>
          <SelectContent>
            {["short", "medium", "long"].map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {currentStat && (
        <div className="text-xs text-muted-foreground">
          Bench: {currentStat.reply_rate}% reply / {currentStat.open_rate}% open ({currentStat.window}, n=
          {currentStat.sends})
        </div>
      )}

      <Input
        placeholder="Optional offer/context (e.g., '15-min demo, setup in 48h')"
        value={offer}
        onChange={(e) => setOffer(e.target.value)}
        disabled={loading}
      />
      <Input
        placeholder="Optional CTA (e.g., 'Are you open to a 15-min chat next week?')"
        value={cta}
        onChange={(e) => setCta(e.target.value)}
        disabled={loading}
      />

      <div className="flex gap-2">
        <Button onClick={run} disabled={loading} aria-busy={loading}>
          {loading ? "Rewriting..." : "Rewrite"}
        </Button>
      </div>

      <div className="grid gap-2">
        {variants.map((v, i) => (
          <div key={i} className="p-3 rounded-lg border">
            <div className="text-sm font-medium mb-1">{v.subject}</div>
            <div
              className="prose prose-invert text-sm"
              dangerouslySetInnerHTML={{ __html: v.html }}
            />
            {v.why && <div className="text-xs text-zinc-500 mt-1">{v.why}</div>}
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => pick(v)} disabled={loading}>
                Use this
              </Button>
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-sm text-zinc-500">Generating variants...</div>
        )}
      </div>
    </div>
  );
}

