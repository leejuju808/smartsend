"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import AutoOptimizeCard from "./auto-optimize-card";
import NudgeABToggle from "../NudgeABToggle";

const ALL = [
  "human_reply",
  "question",
  "positive",
  "neutral",
  "routing",
  "unsubscribe",
  "bounce",
  "oOO",
  "spam",
  "other",
] as const;

const DEFAULT_RULES = {
  labels: ["human_reply", "question", "positive", "neutral", "routing"],
  hours_wait: 48,
  max_nudges: 2,
  auto_send: false,
  tone: "professional",
  length: "short" as "short" | "medium" | "long",
  auto_optimize: false,
  min_hours_wait: 12,
  max_hours_wait: 72,
  step_hours: 6,
  max_nudges_min: 1,
  max_nudges_max: 4,
  tone_pool: ["professional", "friendly", "concise"],
  last_optimized_at: null as string | null,
  optimization_notes: null as string | null,
};

export default function FollowupSettings() {
  const { campaignId } = useParams() as { campaignId: string };
  const [rules, setRules] = React.useState({ ...DEFAULT_RULES });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const j = await fetch(`/api/campaign/${campaignId}/followups/rules`).then((r) => r.json());
      if (j.rules) {
        setRules((prev) => ({
          ...prev,
          ...j.rules,
          tone_pool: j.rules.tone_pool ?? prev.tone_pool,
          last_optimized_at: j.rules.last_optimized_at ?? null,
          optimization_notes: j.rules.optimization_notes ?? null,
        }));
      }
    })();
  }, [campaignId]);

  const handlePatch = React.useCallback((patch: Partial<typeof DEFAULT_RULES>) => {
    setRules((prev) => ({
      ...prev,
      ...patch,
      tone_pool: patch.tone_pool ?? prev.tone_pool,
    }));
  }, []);

  function toggleLabel(x: string) {
    setRules((prev) => ({
      ...prev,
      labels: prev.labels.includes(x) ? prev.labels.filter((v) => v !== x) : [...prev.labels, x],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        labels: rules.labels,
        hours_wait: Number(rules.hours_wait),
        max_nudges: Number(rules.max_nudges),
        auto_send: !!rules.auto_send,
        tone: rules.tone,
        length: rules.length,
        auto_optimize: !!rules.auto_optimize,
        min_hours_wait: Number(rules.min_hours_wait ?? DEFAULT_RULES.min_hours_wait),
        max_hours_wait: Number(rules.max_hours_wait ?? DEFAULT_RULES.max_hours_wait),
        step_hours: Number(rules.step_hours ?? DEFAULT_RULES.step_hours),
        max_nudges_min: Number(rules.max_nudges_min ?? DEFAULT_RULES.max_nudges_min),
        max_nudges_max: Number(rules.max_nudges_max ?? DEFAULT_RULES.max_nudges_max),
        tone_pool: (rules.tone_pool?.length ? rules.tone_pool : DEFAULT_RULES.tone_pool).map((t) => t.trim()).filter(Boolean),
      };

      const r = await fetch(`/api/campaign/${campaignId}/followups/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        alert("Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div className="text-xl font-semibold">Follow-Up Rules</div>

      <NudgeABToggle campaignId={campaignId} />

      <AutoOptimizeCard campaignId={campaignId} rules={rules} onChange={handlePatch} />

      <div className="rounded-2xl border p-4 space-y-4">
        <div className="space-y-2">
          <div className="font-medium">Qualifying inbound labels</div>
          <div className="flex flex-wrap gap-2">
            {ALL.map((x) => (
              <button
                key={x}
                className={`text-xs rounded-full border px-2 py-1 ${rules.labels.includes(x) ? "border-black" : "opacity-50"}`}
                onClick={() => toggleLabel(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            Only threads whose latest inbound matches one of these labels become eligible.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm font-medium mb-1">Wait time</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={720}
                className="w-24 rounded-md border p-2 text-sm"
                value={rules.hours_wait}
                onChange={(e) => handlePatch({ hours_wait: Number(e.target.value) })}
              />
              <span className="text-sm">hours</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Minimum hours after last inbound before nudging.</div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Max nudges</div>
            <input
              type="number"
              min={0}
              max={10}
              className="w-24 rounded-md border p-2 text-sm"
              value={rules.max_nudges}
              onChange={(e) => handlePatch({ max_nudges: Number(e.target.value) })}
            />
            <div className="text-xs text-muted-foreground mt-1">Total nudges allowed per thread.</div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Auto-send</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!rules.auto_send} onChange={(e) => handlePatch({ auto_send: e.target.checked })} />
              Send without review (enqueues directly)
            </label>
            <div className="text-xs text-muted-foreground mt-1">If off, nudges are created as drafts.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm font-medium mb-1">Tone</div>
            <select className="w-full rounded-md border p-2 text-sm" value={rules.tone} onChange={(e) => handlePatch({ tone: e.target.value })}>
              <option>professional</option>
              <option>friendly</option>
              <option>concise</option>
              <option>warm</option>
              <option>assertive</option>
              <option>casual</option>
            </select>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Length</div>
            <select
              className="w-full rounded-md border p-2 text-sm"
              value={rules.length}
              onChange={(e) => handlePatch({ length: e.target.value as "short" | "medium" | "long" })}
            >
              <option value="short">short</option>
              <option value="medium">medium</option>
              <option value="long">long</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save rules"}
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">These rules drive eligibility in the Follow-Ups tab and the auto-generator.</div>
    </div>
  );
}

