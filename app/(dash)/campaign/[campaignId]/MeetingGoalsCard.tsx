"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type MeetingGoalsPayload = {
  intent_to_booked_target: string;
  median_book_time_target: string;
  alert_recipients: string;
};

const DEFAULTS: MeetingGoalsPayload = {
  intent_to_booked_target: "40",
  median_book_time_target: "86400",
  alert_recipients: "",
};

export default function MeetingGoalsCard({ campaignId }: { campaignId: string }) {
  const [form, setForm] = React.useState<MeetingGoalsPayload>(DEFAULTS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaign/${campaignId}/meeting/goals`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const json = await res.json();
        if (cancelled) return;
        setForm({
          intent_to_booked_target: json.intent_to_booked_target != null ? String(json.intent_to_booked_target) : DEFAULTS.intent_to_booked_target,
          median_book_time_target: json.median_book_time_target != null ? String(json.median_book_time_target) : DEFAULTS.median_book_time_target,
          alert_recipients: Array.isArray(json.alert_recipients) ? json.alert_recipients.join(",") : DEFAULTS.alert_recipients,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load goals");
        setForm(DEFAULTS);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        intent_to_booked_target: Number.parseFloat(form.intent_to_booked_target),
        median_book_time_target: Number.parseInt(form.median_book_time_target, 10),
        alert_recipients: form.alert_recipients
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };

      const res = await fetch(`/api/campaign/${campaignId}/meeting/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const message = json?.error ?? `Save failed (${res.status})`;
        throw new Error(typeof message === "string" ? message : "Save failed");
      }

      alert("Meeting goals saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <div className="font-semibold">Meeting Goals & Alerts</div>
        <div className="text-xs text-muted-foreground">
          Track conversion and booking speed targets. Daily alerts go to the recipients below.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Intent → Booked target (%)</label>
          <Input
            value={form.intent_to_booked_target}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, intent_to_booked_target: event.target.value }))
            }
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Median book time target (seconds)</label>
          <Input
            value={form.median_book_time_target}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, median_book_time_target: event.target.value }))
            }
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Alert recipients (comma-separated emails or user IDs)
        </label>
        <Input
          value={form.alert_recipients}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, alert_recipients: event.target.value }))
          }
          placeholder="you@example.com, teammate@example.com"
        />
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save goals"}
      </Button>
    </Card>
  );
}

