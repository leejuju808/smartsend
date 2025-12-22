"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Policy = {
  question_hours: number;
  positive_hours: number;
  neutral_hours: number;
  negative_hours: number;
  ooo_hours: number;
};

const DEFAULT_POLICY: Policy = {
  question_hours: 2,
  positive_hours: 2,
  neutral_hours: 8,
  negative_hours: 0,
  ooo_hours: 0,
};

type Props = {
  campaignId: string;
};

export function SlaPolicyPanel({ campaignId }: Props) {
  const [policy, setPolicy] = React.useState<Policy | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/sla/policy/${campaignId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("failed");
        }
        const data = await response.json();
        if (cancelled) {
          return;
        }
        setPolicy({
          question_hours: Number(data?.question_hours ?? DEFAULT_POLICY.question_hours),
          positive_hours: Number(data?.positive_hours ?? DEFAULT_POLICY.positive_hours),
          neutral_hours: Number(data?.neutral_hours ?? DEFAULT_POLICY.neutral_hours),
          negative_hours: Number(data?.negative_hours ?? DEFAULT_POLICY.negative_hours),
          ooo_hours: Number(data?.ooo_hours ?? DEFAULT_POLICY.ooo_hours),
        });
      } catch {
        if (!cancelled) {
          setPolicy({ ...DEFAULT_POLICY });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const updateField = React.useCallback((key: keyof Policy, value: string) => {
    setPolicy((prev) => {
      const base = prev ?? DEFAULT_POLICY;
      return { ...base, [key]: Number(value) };
    });
  }, []);

  const save = React.useCallback(async () => {
    if (!policy) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/sla/policy/${campaignId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      toast.success("SLA saved");
    } catch {
      toast.error("Failed to save SLA");
    } finally {
      setSaving(false);
    }
  }, [campaignId, policy]);

  if (!policy) {
    return null;
  }

  return (
    <Card className="rounded-2xl border">
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">SLA Policy</h3>
          <p className="text-xs text-muted-foreground">
            Hours until response is due for each label.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Question (hrs)"
            value={policy.question_hours}
            onChange={(value) => updateField("question_hours", value)}
          />
          <Field
            label="Positive (hrs)"
            value={policy.positive_hours}
            onChange={(value) => updateField("positive_hours", value)}
          />
          <Field
            label="Neutral (hrs)"
            value={policy.neutral_hours}
            onChange={(value) => updateField("neutral_hours", value)}
          />
          <Field
            label="Negative (hrs)"
            value={policy.negative_hours}
            onChange={(value) => updateField("negative_hours", value)}
          />
          <Field
            label="OOO (hrs)"
            value={policy.ooo_hours}
            onChange={(value) => updateField("ooo_hours", value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}








