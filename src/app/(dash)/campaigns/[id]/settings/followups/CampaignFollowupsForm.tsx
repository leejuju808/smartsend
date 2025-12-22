"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RuleActionType = "enqueue" | "snooze" | "stop";

type RuleMatch = {
  intent?: string[];
  engagement_min?: number | null;
  engagement_max?: number | null;
  touch_gte?: number | null;
  touch_lte?: number | null;
  ooo?: boolean | null;
};

type RuleAction = {
  type: RuleActionType;
  delay_hours?: number | string | null;
  variant_key?: string | null;
  variant_id?: string | null;
  priority?: number | null;
  hours?: number | string | null;
  until?: string | null;
  reason?: string | null;
  [key: string]: unknown;
};

type RuleRecord = {
  id?: string | null;
  rule_set_id: string;
  position: number;
  isDirty?: boolean;
  match: RuleMatch;
  action: RuleAction;
};

type RuleSet = {
  id: string;
  name: string;
  is_active: boolean;
  position: number;
  followup_rules: RuleRecord[];
};

const INTENT_OPTIONS = [
  { key: "no_reply", label: "No Reply" },
  { key: "neutral", label: "Neutral" },
  { key: "positive", label: "Positive" },
  { key: "question", label: "Question" },
  { key: "negative", label: "Negative" },
  { key: "ooo", label: "OOO" },
];

const DEFAULT_RULE: RuleMatch = {
  intent: ["no_reply"],
  engagement_min: null,
  engagement_max: null,
  touch_gte: null,
  touch_lte: 5,
  ooo: null,
};

const DEFAULT_ACTION: RuleAction = {
  type: "enqueue",
  delay_hours: 24,
  priority: 0,
};

function buildNewRule(ruleSetId: string, position: number): RuleRecord {
  return {
    rule_set_id: ruleSetId,
    position,
    match: { ...DEFAULT_RULE },
    action: { ...DEFAULT_ACTION },
    isDirty: true,
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function RuleRow({
  rule,
  onChange,
  onSave,
  saving,
}: {
  rule: RuleRecord;
  onChange: (next: RuleRecord) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}) {
  const intents = rule.match.intent ?? [];

  const toggleIntent = (intent: string) => {
    const current = new Set(intents);
    if (current.has(intent)) current.delete(intent);
    else current.add(intent);
    onChange({
      ...rule,
      match: { ...rule.match, intent: Array.from(current) },
      isDirty: true,
    });
  };

  const updateMatch = (key: keyof RuleMatch, value: unknown) => {
    onChange({
      ...rule,
      match: { ...rule.match, [key]: value },
      isDirty: true,
    });
  };

  const updateAction = (key: keyof RuleAction, value: unknown) => {
    onChange({
      ...rule,
      action: { ...rule.action, [key]: value },
      isDirty: true,
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Rule #{rule.position}</p>
          <p className="text-xs text-muted-foreground/80">
            Matches threads with these attributes, then applies the selected action.
          </p>
        </div>
        <Button size="sm" disabled={!rule.isDirty || saving} onClick={() => onSave()}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="mt-4 space-y-5">
        <div>
          <Label className="text-sm font-medium">Intent</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTENT_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                  intents.includes(opt.key) ? "border-primary bg-primary/10" : "hover:bg-muted/70"
                )}
              >
                <Checkbox checked={intents.includes(opt.key)} onCheckedChange={() => toggleIntent(opt.key)} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-sm font-medium">Engagement ≥</Label>
            <Input
              type="number"
              value={rule.match.engagement_min ?? ""}
              onChange={(event) => updateMatch("engagement_min", numberOrNull(event.target.value))}
              placeholder="Any"
              min={0}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Engagement ≤</Label>
            <Input
              type="number"
              value={rule.match.engagement_max ?? ""}
              onChange={(event) => updateMatch("engagement_max", numberOrNull(event.target.value))}
              placeholder="Any"
              min={0}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Touch count ≤</Label>
            <Input
              type="number"
              value={rule.match.touch_lte ?? ""}
              onChange={(event) => updateMatch("touch_lte", numberOrNull(event.target.value))}
              placeholder="Any"
              min={0}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-sm font-medium">Touch count ≥</Label>
            <Input
              type="number"
              value={rule.match.touch_gte ?? ""}
              onChange={(event) => updateMatch("touch_gte", numberOrNull(event.target.value))}
              placeholder="Any"
              min={0}
            />
          </div>
          <div className="flex items-center gap-3 rounded-md border px-3 py-2">
            <Switch
              checked={Boolean(rule.match.ooo)}
              onCheckedChange={(checked) => updateMatch("ooo", checked)}
            />
            <div>
              <p className="text-sm font-medium">Requires OOO</p>
              <p className="text-xs text-muted-foreground">Only match when thread is marked out-of-office.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <Label className="text-sm font-medium">Action</Label>
          <Select value={rule.action.type} onValueChange={(val) => updateAction("type", val as RuleActionType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enqueue">Enqueue follow-up</SelectItem>
              <SelectItem value="snooze">Snooze thread</SelectItem>
              <SelectItem value="stop">Stop automation</SelectItem>
            </SelectContent>
          </Select>

          {rule.action.type === "enqueue" && (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label className="text-sm font-medium">Delay (hours)</Label>
                <Input
                  type="number"
                  min={0}
                  value={rule.action.delay_hours ?? ""}
                  onChange={(event) => updateAction("delay_hours", numberOrNull(event.target.value))}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Variant key</Label>
                <Input
                  placeholder="e.g. neutral_soft"
                  value={rule.action.variant_key ?? ""}
                  onChange={(event) => updateAction("variant_key", event.target.value)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Priority</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={rule.action.priority ?? 0}
                  onChange={(event) => updateAction("priority", numberOrNull(event.target.value))}
                />
              </div>
            </div>
          )}

          {rule.action.type === "snooze" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Hours</Label>
                <Input
                  type="number"
                  min={1}
                  value={rule.action.hours ?? ""}
                  onChange={(event) => updateAction("hours", numberOrNull(event.target.value))}
                />
              </div>
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <Switch
                  checked={rule.action.until === "resume_at"}
                  onCheckedChange={(checked) =>
                    updateAction("until", checked ? "resume_at" : null)
                  }
                />
                <div>
                  <p className="text-sm font-medium">Wait until resume time</p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, we wait for the thread&apos;s resume_at timestamp.
                  </p>
                </div>
              </div>
            </div>
          )}

          {rule.action.type === "stop" && (
            <div>
              <Label className="text-sm font-medium">Reason (optional)</Label>
              <Textarea
                placeholder="Why should automation stop?"
                value={(rule.action.reason as string) ?? ""}
                onChange={(event) => updateAction("reason", event.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CampaignFollowupsForm({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [savingRuleId, setSavingRuleId] = React.useState<string | null>(null);
  const [ruleSets, setRuleSets] = React.useState<RuleSet[]>([]);
  const [previewThread, setPreviewThread] = React.useState("");
  const [previewResult, setPreviewResult] = React.useState<any>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [manualDecision, setManualDecision] = React.useState<any>(null);
  const [manualLoading, setManualLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/followup/rulesets/${campaignId}/list`);
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.error ?? "Failed to load rules");
        if (active) setRuleSets((data as RuleSet[]).map((set) => ({
          ...set,
          followup_rules: (set.followup_rules ?? []).sort((a, b) => a.position - b.position),
        })));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load rules";
        toast.error(message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [campaignId]);

  const handleRuleChange = React.useCallback(
    (ruleSetId: string, index: number, next: RuleRecord) => {
      setRuleSets((prev) =>
        prev.map((set) => {
          if (set.id !== ruleSetId) return set;
          const clone = [...set.followup_rules];
          clone[index] = next;
          return { ...set, followup_rules: clone };
        })
      );
    },
    []
  );

  const handleSaveRule = React.useCallback(
    async (rule: RuleRecord) => {
      setSavingRuleId(rule.id ?? `new-${rule.rule_set_id}-${rule.position}`);
      try {
        const res = await fetch("/api/followup/rule/upsert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: rule.id,
            rule_set_id: rule.rule_set_id,
            position: rule.position,
            match: rule.match,
            action: rule.action,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Failed to save rule");
        toast.success("Rule saved");
        setRuleSets((prev) =>
          prev.map((set) => {
            if (set.id !== rule.rule_set_id) return set;
            const updated = set.followup_rules.map((r) =>
              r === rule
                ? { ...data, isDirty: false }
                : r
            );
            return { ...set, followup_rules: updated };
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save rule";
        toast.error(message);
      } finally {
        setSavingRuleId(null);
      }
    },
    []
  );

  const handleAddRule = React.useCallback(
    (ruleSet: RuleSet) => {
      const nextPosition = (ruleSet.followup_rules?.length ?? 0) * 10 + 10;
      const newRule = buildNewRule(ruleSet.id, nextPosition);
      setRuleSets((prev) =>
        prev.map((set) => {
          if (set.id !== ruleSet.id) return set;
          return { ...set, followup_rules: [...(set.followup_rules ?? []), newRule] };
        })
      );
    },
    []
  );

  const runPreview = React.useCallback(async () => {
    if (!previewThread) {
      toast.error("Enter a thread ID to preview");
      return;
    }
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const res = await fetch("/api/followup/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: previewThread }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Preview failed");
      setPreviewResult(data?.match ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewThread]);

  const runOrchestrator = React.useCallback(async () => {
    if (!previewThread) {
      toast.error("Enter a thread ID to run orchestrator");
      return;
    }
    setManualLoading(true);
    setManualDecision(null);
    try {
      const res = await fetch("/api/followup/orchestrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: previewThread }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Orchestrator failed");
      setManualDecision(data?.result ?? null);
      toast.success("Orchestrator executed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Orchestrator failed";
      toast.error(message);
    } finally {
      setManualLoading(false);
    }
  }, [previewThread]);

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
      <CardHeader>
          <CardTitle>Follow-up Rule Engine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
                <Label className="text-sm font-medium">Automation Active</Label>
                <p className="text-xs text-muted-foreground">
                  Toggle per set to enable or disable the orchestrator for this campaign.
                </p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label className="text-sm font-medium">Rule evaluation order</Label>
                <p className="text-xs text-muted-foreground">
                  Sets run top-to-bottom; first matching rule wins within a set.
                </p>
          </div>
              <span className="rounded bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {ruleSets.length} set{ruleSets.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-sm font-medium">Thread preview</Label>
            <div className="grid gap-3 md:grid-cols-[2fr,auto,auto]">
              <Input
                placeholder="Thread ID"
                value={previewThread}
                onChange={(event) => setPreviewThread(event.target.value)}
              />
              <Button variant="outline" onClick={runPreview} disabled={previewLoading}>
                {previewLoading ? "Checking..." : "Preview match"}
              </Button>
              <Button onClick={runOrchestrator} disabled={manualLoading}>
                {manualLoading ? "Running..." : "Run orchestrator"}
              </Button>
        </div>

            {previewResult && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium text-muted-foreground">Matched rule</p>
                <pre className="mt-2 max-h-60 overflow-x-auto rounded bg-background p-3 text-xs">
                  {JSON.stringify(previewResult, null, 2)}
                </pre>
              </div>
            )}

            {manualDecision && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium text-muted-foreground">Orchestrator decision</p>
                <pre className="mt-2 max-h-60 overflow-x-auto rounded bg-background p-3 text-xs">
                  {JSON.stringify(manualDecision, null, 2)}
                </pre>
          </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading rule sets…
          </CardContent>
        </Card>
      ) : (
        ruleSets.map((ruleSet) => (
          <Card key={ruleSet.id} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
          <div>
                <CardTitle>{ruleSet.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Position {ruleSet.position} · {ruleSet.is_active ? "Active" : "Paused"}
                </p>
          </div>
              <Button variant="outline" size="sm" onClick={() => handleAddRule(ruleSet)}>
                Add rule
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {ruleSet.followup_rules?.length ? (
                ruleSet.followup_rules.map((rule, idx) => (
                  <RuleRow
                    key={rule.id ?? `new-${idx}`}
                    rule={rule}
                    saving={savingRuleId === (rule.id ?? `new-${rule.rule_set_id}-${rule.position}`)}
                    onChange={(next) => handleRuleChange(ruleSet.id, idx, next)}
                    onSave={() => handleSaveRule(rule)}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No rules yet. Add one to start orchestrating follow-ups.
          </div>
              )}
      </CardContent>
    </Card>
        ))
      )}
    </div>
  );
}

