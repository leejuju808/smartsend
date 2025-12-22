"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";

const DEFAULT_RULES = {
  auto: { name_thresh: 0.94, company_thresh: 0.92, require_same_domain: true },
  review: { name_thresh: 0.9, company_thresh: 0.88, require_same_domain: true },
  ignore: { name_thresh: 0.8, company_thresh: 0.75, require_same_domain: false },
};

type TierKey = "auto" | "review" | "ignore";

type TierRule = {
  name_thresh: number;
  company_thresh: number;
  require_same_domain: boolean;
};

type SettingsResponse = {
  autoMergeEnabled: boolean;
  rules: Record<TierKey, TierRule>;
  autoReadyCount: number;
};

const TIER_DETAILS: Record<TierKey, { label: string; description: string }> = {
  auto: {
    label: "Auto",
    description: "Pairs that will merge automatically when thresholds are met.",
  },
  review: {
    label: "Review",
    description: "Candidates that require manual review before merging.",
  },
  ignore: {
    label: "Ignore",
    description: "Pairs below these thresholds remain untouched.",
  },
};

export default function DuplicatesSettingsClient() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [autoMergeEnabled, setAutoMergeEnabled] = React.useState(false);
  const [rules, setRules] = React.useState<Record<TierKey, TierRule>>({ ...DEFAULT_RULES });
  const [autoReadyCount, setAutoReadyCount] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const mergeRules = React.useCallback((incoming?: SettingsResponse["rules"]) => {
    if (!incoming) return;
    setRules((prev) => ({
      auto: incoming.auto ?? prev.auto,
      review: incoming.review ?? prev.review,
      ignore: incoming.ignore ?? prev.ignore,
    }));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/dupes/settings", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<SettingsResponse> & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? `Failed to load settings (${res.status})`);
      }

      setAutoMergeEnabled(Boolean(data.autoMergeEnabled));
      mergeRules(data.rules);
      setAutoReadyCount(typeof data.autoReadyCount === "number" ? data.autoReadyCount : 0);
    } catch (err: any) {
      const message = err?.message ?? "Failed to load duplicate settings";
      setErrorMessage(message);
      toast({ variant: "destructive", description: message });
    } finally {
      setLoading(false);
    }
  }, [mergeRules, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const updateRule = React.useCallback((tier: TierKey, patch: Partial<TierRule>) => {
    setRules((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        ...patch,
      },
    }));
  }, []);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/dupes/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoMergeEnabled, rules }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<SettingsResponse> & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save settings");
      }

      setAutoMergeEnabled(Boolean(data.autoMergeEnabled ?? autoMergeEnabled));
      mergeRules(data.rules);
      setAutoReadyCount(typeof data.autoReadyCount === "number" ? data.autoReadyCount : autoReadyCount);

      toast({ description: "Duplicate settings saved." });
    } catch (err: any) {
      toast({ variant: "destructive", description: err?.message ?? "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  }, [autoMergeEnabled, mergeRules, rules, toast, autoReadyCount]);

  const handleRefreshPreview = React.useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/dupes/settings", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<SettingsResponse> & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to refresh preview");
      }

      setAutoReadyCount(typeof data.autoReadyCount === "number" ? data.autoReadyCount : autoReadyCount);
      toast({ description: "Preview refreshed." });
    } catch (err: any) {
      toast({ variant: "destructive", description: err?.message ?? "Failed to refresh preview" });
    } finally {
      setPreviewing(false);
    }
  }, [autoReadyCount, toast]);

  const handleRunAutoMerge = React.useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/dupes/auto-merge?limit=200", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { merged?: number; skipped?: number; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Auto-merge failed");
      }

      toast({ description: `Merged ${data.merged ?? 0} • Skipped ${data.skipped ?? 0}` });
      await handleRefreshPreview();
    } catch (err: any) {
      toast({ variant: "destructive", description: err?.message ?? "Auto-merge failed" });
    } finally {
      setRunning(false);
    }
  }, [handleRefreshPreview, toast]);

  const formatPercent = React.useCallback((value: number) => `${Math.round(value * 100)}%`, []);

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Loading duplicate settings…</div>
      ) : null}

      {!loading && errorMessage ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {!loading && (
        <>
          <div className="rounded-2xl border p-6">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Auto-merge high-confidence dupes</h2>
                <p className="text-sm text-muted-foreground">
                  Automatically merge pairs that meet your <em>Auto</em> thresholds during nightly maintenance.
                </p>
              </div>
              <Switch
                checked={autoMergeEnabled}
                onCheckedChange={setAutoMergeEnabled}
              />
            </div>
          </div>

          <div className="rounded-2xl border p-6 space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Thresholds by tier</h3>
              <p className="text-sm text-muted-foreground">
                Adjust name/company similarity scores and domain requirements for each classification tier.
              </p>
            </div>

            <div className="space-y-6">
              {(Object.keys(TIER_DETAILS) as TierKey[]).map((tier) => (
                <div key={tier} className="rounded-xl border border-border/60 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="text-base font-medium">{TIER_DETAILS[tier].label}</div>
                      <div className="text-sm text-muted-foreground">{TIER_DETAILS[tier].description}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>Name similarity</span>
                        <span className="text-muted-foreground">≥ {formatPercent(rules[tier].name_thresh)}</span>
                      </div>
                      <Slider
                        min={50}
                        max={100}
                        step={1}
                        value={[Math.round(rules[tier].name_thresh * 100)]}
                        onValueChange={(values) => updateRule(tier, { name_thresh: (values[0] ?? 0) / 100 })}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>Company similarity</span>
                        <span className="text-muted-foreground">≥ {formatPercent(rules[tier].company_thresh)}</span>
                      </div>
                      <Slider
                        min={40}
                        max={100}
                        step={1}
                        value={[Math.round(rules[tier].company_thresh * 100)]}
                        onValueChange={(values) => updateRule(tier, { company_thresh: (values[0] ?? 0) / 100 })}
                      />
                    </div>
                  </div>

                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={rules[tier].require_same_domain}
                      onCheckedChange={(checked) => updateRule(tier, { require_same_domain: Boolean(checked) })}
                    />
                    Require matching email domain
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-6 space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-semibold">Preview</div>
                <div className="text-sm text-muted-foreground">
                  {autoReadyCount} pair{autoReadyCount === 1 ? "" : "s"} currently qualify for auto-merge.
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleRefreshPreview}
                  disabled={previewing || loading}
                >
                  {previewing ? "Refreshing…" : "Refresh preview"}
                </Button>
                <Button
                  onClick={handleRunAutoMerge}
                  disabled={running || loading}
                >
                  {running ? "Running…" : "Run auto-merge"}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={load}
                disabled={loading || saving || running || previewing}
              >
                Reset
              </Button>
              <Button onClick={handleSave} disabled={saving || loading}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
