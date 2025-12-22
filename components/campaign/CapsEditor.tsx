"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SCENARIOS = ["no_reply", "question", "positive", "neutral", "routing"];
const TONES = ["professional", "friendly", "concise", "assertive"];

type CapsMap = Record<string, number | null>;

function keyFor(scenario: string, tone: string) {
  return `${scenario}::${tone}`;
}

export default function CapsEditor({ campaignId }: { campaignId: string }) {
  const [caps, setCaps] = React.useState<CapsMap>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/followup/caps`, { cache: "no-store" });
      const payload = await res.json();
      if (payload?.ok && Array.isArray(payload.caps)) {
        const initial: CapsMap = {};
        for (const scenario of SCENARIOS) {
          for (const tone of TONES) {
            initial[keyFor(scenario, tone)] = null;
          }
        }
        for (const row of payload.caps) {
          if (!row) continue;
          const scenario = String(row.scenario ?? "");
          const tone = String(row.tone ?? "");
          const daily = Number(row.daily_cap);
          if (!scenario || !tone) continue;
          initial[keyFor(scenario, tone)] =
            Number.isFinite(daily) && daily > 0 ? Math.floor(daily) : null;
        }
        setCaps(initial);
      } else {
        setCaps({});
        toast.error("Failed to load caps.");
      }
    } catch {
      setCaps({});
      toast.error("Failed to load caps.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleInput = React.useCallback((scenario: string, tone: string, value: string) => {
    const parsed = Number.parseInt(value, 10);
    setCaps((prev) => {
      const next = { ...prev };
      next[keyFor(scenario, tone)] =
        value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed;
      return next;
    });
  }, []);

  const save = React.useCallback(async () => {
    setSaving(true);
    try {
      const rows = Object.entries(caps)
        .map(([key, value]) => {
          if (!value || value <= 0) return null;
          const [scenario, tone] = key.split("::");
          return { scenario, tone, daily_cap: value };
        })
        .filter(Boolean);

      const res = await fetch(`/api/campaign/${campaignId}/followup/caps`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caps: rows }),
      });
      if (!res.ok) {
        toast.error("Failed to save caps.");
      } else {
        await load();
        toast.success("Caps saved.");
      }
    } finally {
      setSaving(false);
    }
  }, [caps, campaignId, load]);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nudge caps (per day)</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading || saving}>
            Refresh
          </Button>
          <Button size="sm" onClick={save} disabled={loading || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {SCENARIOS.flatMap((scenario) =>
          TONES.map((tone) => {
            const key = keyFor(scenario, tone);
            const value = caps[key];
            return (
              <div key={key} className="rounded border p-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  {scenario} · {tone}
                </div>
                <Input
                  type="number"
                  min={0}
                  placeholder="no cap"
                  value={value ?? ""}
                  onChange={(e) => handleInput(scenario, tone, e.target.value)}
                  onBlur={(e) => handleInput(scenario, tone, e.target.value)}
                  disabled={loading}
                />
              </div>
            );
          })
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Leave blank = no cap. Caps count queued/sent nudges created today in that bucket.
      </div>
    </div>
  );
}


