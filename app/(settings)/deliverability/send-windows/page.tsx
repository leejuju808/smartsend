"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";

type DayWindow = [number, number] | null;
type WindowsState = Record<string, DayWindow>;
type PacingState = Record<string, number>;

const DAYS: Array<keyof WindowsState> = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DEFAULT_WINDOWS: WindowsState = {
  mon: [9, 17],
  tue: [9, 17],
  wed: [9, 17],
  thu: [9, 17],
  fri: [9, 17],
  sat: null,
  sun: null,
};
const DEFAULT_PACING: PacingState = {
  gmail: 60,
  outlook: 40,
  yahoo: 30,
  other: 80,
};

function normalizeHour(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(24, Math.max(0, Math.floor(value)));
}

export default function SendWindowsPage() {
  const [windows, setWindows] = useState<WindowsState>(DEFAULT_WINDOWS);
  const [minHour, setMinHour] = useState(8);
  const [maxHour, setMaxHour] = useState(18);
  const [pacing, setPacing] = useState<PacingState>(DEFAULT_PACING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sortedBuckets = useMemo(() => Object.keys(DEFAULT_PACING), []);

  const setRange = useCallback((day: keyof WindowsState, start: number | null, end: number | null) => {
    setWindows((prev) => ({
      ...prev,
      [day]: start === null || end === null ? null : [start, end],
    }));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/deliverability/send-windows", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 404) {
          setWindows(DEFAULT_WINDOWS);
          setMinHour(8);
          setMaxHour(18);
          setPacing(DEFAULT_PACING);
          return;
        }
        throw new Error(await response.text());
      }

      const payload = await response.json();
      if (payload?.policy?.windows) {
        setWindows((prev) => {
          const next: WindowsState = { ...prev };
          for (const day of DAYS) {
            const raw = payload.policy.windows?.[day];
            if (Array.isArray(raw) && raw.length === 2) {
              next[day] = [normalizeHour(Number(raw[0]), DEFAULT_WINDOWS[day]?.[0] ?? 9), normalizeHour(Number(raw[1]), DEFAULT_WINDOWS[day]?.[1] ?? 17)];
            } else {
              next[day] = null;
            }
          }
          return next;
        });
      }
      if (typeof payload?.policy?.min_hour === "number") {
        setMinHour(normalizeHour(payload.policy.min_hour, 8));
      }
      if (typeof payload?.policy?.max_hour === "number") {
        setMaxHour(normalizeHour(payload.policy.max_hour, 18));
      }
      if (payload?.pacing) {
        setPacing((prev) => {
          const next: PacingState = { ...prev };
          for (const bucket of sortedBuckets) {
            const value = Number(payload.pacing[bucket]);
            next[bucket] = Number.isFinite(value) ? value : prev[bucket];
          }
          return next;
        });
      }
    } catch (error) {
      console.error("[SendWindowsPage] Failed to load", error);
      toast.error("Failed to load send window settings");
    } finally {
      setLoading(false);
    }
  }, [sortedBuckets]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/deliverability/send-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windows,
          min_hour: minHour,
          max_hour: maxHour,
          pacing,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save settings");
      }

      toast.success("Send windows saved");
      await load();
    } catch (error: any) {
      console.error("[SendWindowsPage] Failed to save", error);
      toast.error(error?.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [windows, minHour, maxHour, pacing, load]);

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6 text-sm text-muted-foreground">Loading send window settings…</CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Send Windows & ISP Pacing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {DAYS.map((day) => {
            const active = Boolean(windows[day]);
            const start = windows[day]?.[0] ?? 9;
            const end = windows[day]?.[1] ?? 17;

            return (
              <div key={day} className="space-y-2 rounded-xl border p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={active}
                    onCheckedChange={(on) => setWindows((prev) => ({ ...prev, [day]: on ? [9, 17] : null }))}
                  />
                  {active ? (
                    <>
                      <Input
                        type="number"
                        className="w-20"
                        min={0}
                        max={23}
                        value={start}
                        onChange={(event) => setRange(day, normalizeHour(Number(event.target.value), start), end)}
                      />
                      <span className="text-muted-foreground">—</span>
                      <Input
                        type="number"
                        className="w-20"
                        min={1}
                        max={24}
                        value={end}
                        onChange={(event) => setRange(day, start, normalizeHour(Number(event.target.value), end))}
                      />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Off</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border p-4">
            <div className="text-sm font-medium">Quiet hours clamp</div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="w-16 uppercase">Min</span>
              <Input
                type="number"
                className="w-24"
                min={0}
                max={23}
                value={minHour}
                onChange={(event) => setMinHour(normalizeHour(Number(event.target.value), minHour))}
              />
              <span className="w-16 text-right uppercase">Max</span>
              <Input
                type="number"
                className="w-24"
                min={1}
                max={24}
                value={maxHour}
                onChange={(event) => setMaxHour(normalizeHour(Number(event.target.value), maxHour))}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="text-sm font-medium">ISP pacing (max per minute)</div>
            {sortedBuckets.map((bucket) => (
              <div key={bucket} className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="w-24 uppercase">{bucket}</span>
                <Input
                  type="number"
                  className="w-24"
                  min={1}
                  value={pacing[bucket]}
                  onChange={(event) =>
                    setPacing((prev) => ({
                      ...prev,
                      [bucket]: Math.max(1, Number(event.target.value) || prev[bucket]),
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

