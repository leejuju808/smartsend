"use client";

import * as React from "react";
import { CheckCircle2, Pencil, Target, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Goal = {
  id: string;
  window_days: number;
  target_sends: number | null;
  target_reply_rate: number | null;
  target_open_rate: number | null;
  target_bounce_rate: number | null;
  notes?: string | null;
};

type GoalStatus = {
  window_days: number;
  target_sends: number | null;
  target_reply_rate: number | null;
  target_open_rate: number | null;
  target_bounce_rate: number | null;
  sends: number;
  replies: number;
  reply_rate: number;
  opens: number;
  open_rate: number;
  bounce_rate: number;
  ok_sends: boolean;
  ok_reply_rate: boolean;
  ok_open_rate: boolean;
  ok_bounce_rate: boolean;
};

const WINDOW_OPTIONS = [7, 14, 30, 60, 90, 180];

export function GoalBar({ id }: { id: string }) {
  const [goal, setGoal] = React.useState<Goal | null>(null);
  const [status, setStatus] = React.useState<GoalStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, goalRes] = await Promise.all([
        fetch(`/api/campaign/${id}/goals/status`).then((r) => r.json()),
        fetch(`/api/campaign/${id}/goals`).then((r) => r.json()),
      ]);

      setStatus(statusRes?.status ?? null);
      setGoal(goalRes?.goal ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goal");
      setStatus(null);
      setGoal(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-between rounded-xl border p-3 text-sm text-muted-foreground">
        Loading goal…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-xl border p-3 text-sm text-red-600">
        {error}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="flex items-center justify-between rounded-xl border p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="h-4 w-4" />
          No goal set. Create a target to track progress automatically.
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          Set Goal
        </Button>
        <GoalDialog
          id={id}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={load}
          initialGoal={status ?? undefined}
        />
      </div>
          initialGoal={status ?? undefined}
        />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-between rounded-xl border p-3">
        <div className="text-sm text-muted-foreground">
          We couldn&apos;t load the latest performance metrics. Try refreshing or updating the goal.
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Pencil className="mr-1 h-4 w-4" />
          Edit
        </Button>
        <GoalDialog id={id} open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} initialGoal={goal} />
      </div>
    );
  }

  const items = [
    { label: "Sends", ok: status?.ok_sends, value: status?.sends, target: status?.target_sends, suffix: "" },
    {
      label: "Reply Rate",
      ok: status?.ok_reply_rate,
      value: status?.reply_rate,
      target: status?.target_reply_rate,
      suffix: "%",
      precision: 2,
    },
    {
      label: "Open Rate",
      ok: status?.ok_open_rate,
      value: status?.open_rate,
      target: status?.target_open_rate,
      suffix: "%",
      precision: 2,
    },
    {
      label: "Bounce Rate",
      ok: status?.ok_bounce_rate,
      value: status?.bounce_rate,
      target: status?.target_bounce_rate,
      suffix: "%",
      precision: 2,
    },
  ].filter((item) => item.target !== null && item.target !== undefined);

  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <div className="flex flex-wrap gap-3">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active targets. Edit to set thresholds.</div>
        ) : (
          items.map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm">
              {item.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <div className="font-medium">{item.label}</div>
              <div className="text-muted-foreground">•</div>
              <div>
                {formatMetric(item.value, item.precision)}
                {item.suffix} /{" "}
                <span className="text-muted-foreground">
                  {formatMetric(item.target, item.precision)}
                  {item.suffix}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
        <Pencil className="mr-1 h-4 w-4" />
        Edit
      </Button>
      <GoalDialog id={id} open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} initialGoal={goal ?? undefined} />
    </div>
  );
}

function formatMetric(value: number | null | undefined, precision = 0) {
  if (value === null || value === undefined) return "—";
  return precision > 0 ? value.toFixed(precision) : value.toString();
}

function GoalDialog({
  id,
  open,
  onOpenChange,
  onSaved,
  initialGoal,
}: {
  id: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSaved: () => void;
  initialGoal?: Partial<GoalStatus> | Goal | null;
}) {
  const [form, setForm] = React.useState({
    window_days: initialGoal?.window_days ?? 30,
    target_sends: initialGoal?.target_sends ?? "",
    target_reply_rate: initialGoal?.target_reply_rate ?? "",
    target_open_rate: initialGoal?.target_open_rate ?? "",
    target_bounce_rate: initialGoal?.target_bounce_rate ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm({
        window_days: initialGoal?.window_days ?? 30,
        target_sends: initialGoal?.target_sends ?? "",
        target_reply_rate: initialGoal?.target_reply_rate ?? "",
        target_open_rate: initialGoal?.target_open_rate ?? "",
        target_bounce_rate: initialGoal?.target_bounce_rate ?? "",
      });
      setError(null);
    }
  }, [initialGoal, open]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaign/${id}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          target_sends: form.target_sends === "" ? null : Number(form.target_sends),
          target_reply_rate: form.target_reply_rate === "" ? null : Number(form.target_reply_rate),
          target_open_rate: form.target_open_rate === "" ? null : Number(form.target_open_rate),
          target_bounce_rate: form.target_bounce_rate === "" ? null : Number(form.target_bounce_rate),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to save goal");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialGoal ? "Edit Campaign Goal" : "Set Campaign Goal"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="text-sm font-medium" htmlFor="goal-window">
            Window
          </label>
          <select
            id="goal-window"
            className="rounded-md border p-2 text-sm"
            value={form.window_days}
            onChange={(e) => setForm((prev) => ({ ...prev, window_days: Number(e.target.value) }))}
          >
            {WINDOW_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>

          {[
            ["target_sends", "Target Sends (window)"],
            ["target_reply_rate", "Target Reply Rate %"],
            ["target_open_rate", "Target Open Rate %"],
            ["target_bounce_rate", "Max Bounce Rate %"],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="text-sm font-medium" htmlFor={`goal-${key}`}>
                {label}
              </label>
              <input
                id={`goal-${key}`}
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={(form as any)[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="Leave blank if no target"
                inputMode="decimal"
              />
            </div>
          ))}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


