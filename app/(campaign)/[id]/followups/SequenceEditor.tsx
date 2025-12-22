"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import SequenceAnalytics from "./SequenceAnalytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type StepDraft = {
  id?: string;
  step_order: number;
  delay_hours: number;
  send_window_start: number;
  send_window_end: number;
  stop_on_reply: boolean;
  stop_on_meeting: boolean;
  template_id?: string;
  branches: string;
};

type QuietHoursDraft = {
  tz: string;
  start_hour: number;
  end_hour: number;
  workdays: string;
};

type BlackoutDraft = {
  id?: string;
  date: string;
  reason: string;
};

const branchPresets = [
  { label: "Intent is question → Step 4", snippet: '{"intent":"question","goto_step":4}' },
  { label: "Lead score ≥ 80 → Step 2", snippet: '{"lead_score":{">=":80},"goto_step":2}' },
  { label: "No opens in 72h → Step 3", snippet: '{"no_open_since_hours":72,"goto_step":3}' }
];

const defaultStep = (order: number): StepDraft => ({
  step_order: order,
  delay_hours: 48,
  send_window_start: 8,
  send_window_end: 17,
  stop_on_reply: true,
  stop_on_meeting: true,
  branches: "[]"
});

const defaultQuietHours: QuietHoursDraft = {
  tz: "America/Los_Angeles",
  start_hour: 20,
  end_hour: 7,
  workdays: "1,2,3,4,5"
};

export type SequenceEditorProps = {
  campaignId: string;
  sequenceId?: string;
  initialSteps?: StepDraft[];
  initialQuietHours?: QuietHoursDraft;
  initialBlackouts?: BlackoutDraft[];
  onSave?: (payload: {
    sequenceId?: string;
    steps: StepDraft[];
    quietHours: QuietHoursDraft;
    blackouts: BlackoutDraft[];
  }) => Promise<void> | void;
};

export function SequenceEditor({
  campaignId,
  sequenceId,
  initialSteps,
  initialQuietHours,
  initialBlackouts,
  onSave
}: SequenceEditorProps) {
  const [steps, setSteps] = useState<StepDraft[]>(
    () => reindexSteps(initialSteps?.length ? initialSteps : [defaultStep(1)])
  );
  const [quietHours, setQuietHours] = useState<QuietHoursDraft>(
    initialQuietHours ?? defaultQuietHours
  );
  const [blackouts, setBlackouts] = useState<BlackoutDraft[]>(initialBlackouts ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<"owner" | "editor" | "viewer" | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Fetch user role for this campaign
  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/role`)
      .then(r => r.json())
      .then(data => {
        setRole(data.role || null);
        setRoleLoading(false);
      })
      .catch(() => {
        setRoleLoading(false);
      });
  }, [campaignId]);

  const isViewer = role === "viewer";
  const canEdit = role === "owner" || role === "editor";

  const addStep = () => {
    setSteps(prev => reindexSteps([...prev, defaultStep(prev.length + 1)]));
  };

  const removeStep = (index: number) => {
    setSteps(prev => reindexSteps(prev.filter((_, i) => i !== index)));
  };

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setSteps(prev =>
      reindexSteps(
        prev.map((step, i) => (i === index ? { ...step, ...patch } : step))
      )
    );
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return reindexSteps(next);
    });
  };

  const addBlackout = () => {
    setBlackouts(prev => [...prev, { date: "", reason: "" }]);
  };

  const updateBlackout = (index: number, patch: Partial<BlackoutDraft>) => {
    setBlackouts(prev => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const removeBlackout = (index: number) => {
    setBlackouts(prev => prev.filter((_, i) => i !== index));
  };

  const formattedSteps = useMemo(() => steps, [steps]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const payload = {
        campaignId,
        sequenceId,
        steps: formattedSteps,
        quietHours,
        blackouts
      };

      if (onSave) {
        await onSave(payload);
      } else {
        await fetch("/api/followups/sequences", {
          method: sequenceId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      setSuccess("Sequence saved.");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save sequence");
    } finally {
      setSaving(false);
    }
  }, [campaignId, sequenceId, formattedSteps, quietHours, blackouts, onSave]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Follow-up Sequence</h1>
          <p className="text-sm text-muted-foreground">
            Configure branching, delays, and delivery windows for campaign follow-ups.
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Sequence"}
          </Button>
        )}
      </header>

      {isViewer && (
        <div className="bg-yellow-200 text-yellow-900 px-3 py-2 rounded text-sm">
          You have read-only access to this campaign.
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      {sequenceId && (
        <section>
          <SequenceAnalytics sequenceId={sequenceId} />
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Steps</h2>
          {canEdit && (
            <Button variant="outline" onClick={addStep}>
              Add Step
            </Button>
          )}
        </div>

        <div className={`grid gap-4 ${isViewer ? "opacity-60 pointer-events-none" : ""}`}>
          {steps.map((step, index) => (
            <StepCard
              key={index}
              step={step}
              order={index + 1}
              onChange={patch => updateStep(index, patch)}
              onRemove={() => removeStep(index)}
              onMoveUp={() => moveStep(index, -1)}
              onMoveDown={() => moveStep(index, 1)}
              readOnly={isViewer}
            />
          ))}
        </div>
      </section>

      <div className={isViewer ? "opacity-60 pointer-events-none" : ""}>
        <QuietHoursCard value={quietHours} onChange={setQuietHours} />
        <BlackoutDatesCard
          value={blackouts}
          onChange={updateBlackout}
          onAdd={addBlackout}
          onRemove={removeBlackout}
        />
      </div>
    </div>
  );
}

type StepCardProps = {
  step: StepDraft;
  order: number;
  onChange: (patch: Partial<StepDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  readOnly?: boolean;
};

function StepCard({ step, order, onChange, onRemove, onMoveUp, onMoveDown, readOnly }: StepCardProps) {
  const insertPreset = (snippet: string) => {
    try {
      const existing = JSON.parse(step.branches || "[]");
      const candidate = JSON.parse(snippet);
      const merged = Array.isArray(existing) ? [...existing, candidate] : [candidate];
      onChange({ branches: JSON.stringify(merged, null, 2) });
    } catch {
      onChange({ branches: snippet });
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Step {order}</CardTitle>
          {!readOnly && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onMoveUp} disabled={order === 1}>
                Move Up
              </Button>
              <Button variant="outline" size="sm" onClick={onMoveDown}>
                Move Down
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs">Template ID</label>
            <Input
              placeholder="template uuid"
              value={step.template_id ?? ""}
              onChange={e => onChange({ template_id: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="text-xs">Delay (hrs)</label>
            <Input
              type="number"
              value={step.delay_hours}
              onChange={e => onChange({ delay_hours: Number(e.target.value) })}
              disabled={readOnly}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs">Window Start</label>
              <Input
                type="number"
                value={step.send_window_start}
                onChange={e => onChange({ send_window_start: Number(e.target.value) })}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-xs">Window End</label>
              <Input
                type="number"
                value={step.send_window_end}
                onChange={e => onChange({ send_window_end: Number(e.target.value) })}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={step.stop_on_reply}
              onCheckedChange={value => onChange({ stop_on_reply: value })}
              disabled={readOnly}
            />
            Stop on reply
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={step.stop_on_meeting}
              onCheckedChange={value => onChange({ stop_on_meeting: value })}
              disabled={readOnly}
            />
            Stop on meeting
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Branches (JSON array)</label>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                {branchPresets.map(preset => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => insertPreset(preset.snippet)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Textarea
            value={step.branches}
            onChange={e => onChange({ branches: e.target.value })}
            placeholder='[{"intent":"question","goto_step":4}]'
            className="font-mono text-xs"
            rows={4}
            disabled={readOnly}
          />
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <Button variant="destructive" onClick={onRemove}>
              Remove Step
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type QuietHoursCardProps = {
  value: QuietHoursDraft;
  onChange: (value: QuietHoursDraft) => void;
};

function QuietHoursCard({ value, onChange }: QuietHoursCardProps) {
  const update = (patch: Partial<QuietHoursDraft>) => onChange({ ...value, ...patch });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiet Hours & Workdays</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-xs">Timezone (IANA)</label>
            <Input value={value.tz} onChange={e => update({ tz: e.target.value })} />
          </div>
          <div>
            <label className="text-xs">Start hour</label>
            <Input
              type="number"
              value={value.start_hour}
              onChange={e => update({ start_hour: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs">End hour</label>
            <Input
              type="number"
              value={value.end_hour}
              onChange={e => update({ end_hour: Number(e.target.value) })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs">Workdays (1=Mon ... 7=Sun)</label>
          <Input
            value={value.workdays}
            onChange={e => update({ workdays: e.target.value })}
            placeholder="1,2,3,4,5"
          />
        </div>
      </CardContent>
    </Card>
  );
}

type BlackoutDatesCardProps = {
  value: BlackoutDraft[];
  onChange: (index: number, patch: Partial<BlackoutDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

function BlackoutDatesCard({ value, onChange, onAdd, onRemove }: BlackoutDatesCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Blackout Dates</CardTitle>
        <Button variant="outline" size="sm" onClick={onAdd}>
          Add date
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {value.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No blackout dates configured.
          </p>
        )}
        {value.map((blackout, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-5 md:items-end">
            <div className="md:col-span-2">
              <label className="text-xs">Date</label>
              <Input
                type="date"
                value={blackout.date}
                onChange={e => onChange(index, { date: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-xs">Reason</label>
              <Input
                value={blackout.reason}
                onChange={e => onChange(index, { reason: e.target.value })}
                placeholder="Holiday, company event, etc."
              />
            </div>
            <div className="md:col-span-5 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function reindexSteps(steps: StepDraft[]): StepDraft[] {
  return steps.map((step, index) => ({ ...step, step_order: index + 1 }));
}


