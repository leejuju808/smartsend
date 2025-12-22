/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Thresholds = Record<string, number>;

type MetricValue = {
  value: number | null;
  total: number;
};

type MetricsResponse = {
  borderAccuracy: MetricValue;
  meetingPrecision: MetricValue;
  oooRecall: MetricValue;
};

const LABELS: { key: string; name: string; description: string }[] = [
  { key: "positive", name: "Positive", description: "Meeting booked or strong buying signals." },
  { key: "neutral", name: "Neutral", description: "Replies that require human follow-up." },
  { key: "objection", name: "Objection", description: "Pushback or blockers you may overcome." },
  { key: "meeting_intent", name: "Meeting Intent", description: "Prospect ready to schedule." },
  { key: "out_of_office", name: "Out of Office", description: "Auto-responder or away until later." },
  { key: "unsubscribe", name: "Unsubscribe", description: "Do-not-contact requests." },
  { key: "bounce", name: "Bounce", description: "Delivery failure or invalid address." },
  { key: "other", name: "Other", description: "Fallback for new or unknown reply types." },
];

const DEFAULT_THRESHOLD = 0.55;

function percentDisplay(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}

const METRIC_INFO: Record<keyof MetricsResponse, { title: string; helper: string }> = {
  borderAccuracy: {
    title: "Accuracy @ Border",
    helper: "Gold labels vs predictions where confidence is 45–60%",
  },
  meetingPrecision: {
    title: "Meeting Precision",
    helper: "How often 'meeting_intent' predictions are correct",
  },
  oooRecall: {
    title: "OOO Recall",
    helper: "Gold out-of-office replies detected by the model",
  },
};

export default function ClassifierSettingsPage() {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [initialThresholds, setInitialThresholds] = useState<Thresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [thresholdRes, metricsRes] = await Promise.all([
        fetch("/api/label-review/thresholds"),
        fetch("/api/label-review/metrics"),
      ]);

      if (!thresholdRes.ok) {
        const json = await thresholdRes.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to load thresholds");
      }

      const thresholdJson = await thresholdRes.json();
      const next = (thresholdJson?.thresholds ?? {}) as Thresholds;
      setThresholds(next);
      setInitialThresholds(next);

      if (metricsRes.ok) {
        const metricsJson = await metricsRes.json().catch(() => null);
        setMetrics(metricsJson?.metrics ?? null);
      } else {
        setMetrics(null);
      }
    } catch (err: any) {
      console.error("Load classifier thresholds failed", err);
      toast.error(err?.message || "Unable to load classifier thresholds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setThresholds(() =>
      LABELS.reduce<Thresholds>((acc, label) => {
        acc[label.key] = DEFAULT_THRESHOLD;
        return acc;
      }, {}),
    );
  };

  const hasChanges = useMemo(() => {
    if (!thresholds || !initialThresholds) return false;
    return JSON.stringify(thresholds) !== JSON.stringify(initialThresholds);
  }, [thresholds, initialThresholds]);

  const updateThreshold = (label: string, value: number) => {
    setThresholds((prev) => {
      const next = { ...(prev ?? {}) };
      next[label] = Math.min(Math.max(value, 0), 1);
      return next;
    });
  };

  const save = async () => {
    if (!thresholds) return;
    setSaving(true);
    try {
      const response = await fetch("/api/label-review/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thresholds),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || "Failed to save thresholds");
      }
      setInitialThresholds(thresholds);
      toast.success("Classifier thresholds saved");
    } catch (err: any) {
      console.error("Save classifier thresholds failed", err);
      toast.error(err?.message || "Unable to save thresholds");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !thresholds) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-56" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!thresholds) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Unable to load classifier thresholds. Try refreshing the page.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Reply Classifier</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tune the minimum confidence for each label. These thresholds drive the live reply detector, auto-pausing sequences, and downstream automations.
        </p>
      </div>

      {metrics && (
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(METRIC_INFO) as (keyof MetricsResponse)[]).map((key) => {
            const metric = metrics[key];
            const info = METRIC_INFO[key];
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{info.title}</CardTitle>
                  <CardDescription>{info.helper}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{percentDisplay(metric?.value ?? null)}</div>
                  <div className="text-xs text-muted-foreground">
                    Sample size: {metric?.total ?? 0} labels (last 14 days)
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Target Confidence</CardTitle>
            <CardDescription>
              Adjust per-label thresholds. Higher values reduce false positives but may miss borderline replies.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reset}>
              Reset defaults
            </Button>
            <Button onClick={save} disabled={!hasChanges || saving} size="sm">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {LABELS.map((label) => {
            const value = thresholds[label.key] ?? DEFAULT_THRESHOLD;
            return (
              <div key={label.key} className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium">{label.name}</div>
                    <p className="text-xs text-muted-foreground">{label.description}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(Math.round(value * 1000) / 10).toFixed(1)}% minimum confidence
                  </div>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round(value * 100)]}
                  onValueChange={([next]) => updateThreshold(label.key, (next ?? 0) / 100)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
















