"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Rules = {
  auto_optimize?: boolean;
  min_hours_wait?: number;
  max_hours_wait?: number;
  step_hours?: number;
  max_nudges_min?: number;
  max_nudges_max?: number;
  tone_pool?: string[];
  last_optimized_at?: string | null;
  optimization_notes?: string | null;
  hours_wait?: number;
  max_nudges?: number;
  tone?: string;
};

export default function AutoOptimizeCard({
  campaignId,
  rules,
  onChange,
}: {
  campaignId: string;
  rules: Rules;
  onChange: (patch: Partial<Rules>) => void;
}) {
  const [running, setRunning] = React.useState(false);
  const [lastPreview, setLastPreview] = React.useState<any>(null);

  async function runNow() {
    setRunning(true);
    try {
      const r = await fetch(`/api/campaign/${campaignId}/followup/auto-optimize`, { method: "POST" });
      const j = await r.json();
      setLastPreview(j.item || { message: "No change suggested." });

      if (r.ok && j.ok && j.item?.after) {
        onChange({
          hours_wait: j.item.after.hours_wait,
          max_nudges: j.item.after.max_nudges,
          tone: j.item.after.tone,
          last_optimized_at: new Date().toISOString(),
          optimization_notes: j.item.reason ?? null,
        });
        alert(`Updated: wait ${j.item.after.hours_wait}h, nudges ${j.item.after.max_nudges}, tone ${j.item.after.tone}`);
      } else {
        alert(j.item?.message || j.error || "No change or not applicable.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to run optimization.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Auto-Optimize Follow-Ups</div>
          <p className="text-xs text-muted-foreground">
            Tighten or soften your follow-ups based on booking speed, conversion, and negative reply rate.
          </p>
        </div>
        <Switch checked={!!rules.auto_optimize} onCheckedChange={(v) => onChange({ auto_optimize: v })} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Min hours wait</Label>
          <Input
            type="number"
            value={rules.min_hours_wait ?? 12}
            onChange={(e) => onChange({ min_hours_wait: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Max hours wait</Label>
          <Input
            type="number"
            value={rules.max_hours_wait ?? 72}
            onChange={(e) => onChange({ max_hours_wait: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Step hours</Label>
          <Input
            type="number"
            value={rules.step_hours ?? 6}
            onChange={(e) => onChange({ step_hours: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Min nudges</Label>
          <Input
            type="number"
            value={rules.max_nudges_min ?? 1}
            onChange={(e) => onChange({ max_nudges_min: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Max nudges</Label>
          <Input
            type="number"
            value={rules.max_nudges_max ?? 4}
            onChange={(e) => onChange({ max_nudges_max: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Tone pool (csv)</Label>
          <Input
            value={(rules.tone_pool ?? ["professional", "friendly", "concise"]).join(",")}
            onChange={(e) => onChange({ tone_pool: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" disabled={!rules.auto_optimize || running} onClick={runNow}>
          {running ? "Optimizing…" : "Run optimize now"}
        </Button>
        {rules.last_optimized_at && (
          <div className="text-xs text-muted-foreground self-center">
            Last run: {new Date(rules.last_optimized_at).toLocaleString()}
          </div>
        )}
      </div>

      {!!lastPreview && (
        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">Last suggestion</div>
          <pre className="text-xs whitespace-pre-wrap mt-1">{JSON.stringify(lastPreview, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}

