"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type GuardConfig = {
  owner_id: string;
  min_words: number;
  max_words: number;
  require_cta: boolean;
  require_unsubscribe_line: boolean;
  require_postal_address: boolean;
  forbid_phrases: string[];
  block_caps_ratio: number;
  max_links: number;
  my_meeting_link: string | null;
  org_address: string | null;
};

type GuardIssue = {
  rule: string;
  msg: string;
  severity: "info" | "warn" | "error";
};

type GuardAuditRow = {
  id: string;
  created_at: string;
  severity: "info" | "warn" | "error";
  rule: string;
  message: string;
  draft_before: string | null;
  draft_after: string | null;
};

type GuardTestResult = {
  blocked: boolean;
  draft: string;
  issues: GuardIssue[];
};

const severityTone: Record<GuardIssue["severity"], string> = {
  error: "bg-red-500/10 text-red-500",
  warn: "bg-amber-500/10 text-amber-600",
  info: "bg-blue-500/10 text-blue-500",
};

export function ComplianceGuard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<GuardConfig | null>(null);
  const [form, setForm] = useState<GuardConfig | null>(null);
  const [audit, setAudit] = useState<GuardAuditRow[]>([]);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const [testDraft, setTestDraft] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GuardTestResult | null>(null);

  const hasChanges = useMemo(() => {
    if (!config || !form) return false;
    return JSON.stringify(config) !== JSON.stringify(form);
  }, [config, form]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/compliance/guard");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load guard settings");
        }
        const cfg: GuardConfig = {
          ...data.config,
          forbid_phrases: Array.isArray(data.config?.forbid_phrases)
            ? data.config.forbid_phrases
            : [],
        };
        setConfig(cfg);
        setForm(cfg);
        setAudit(Array.isArray(data.audit) ? data.audit : []);
      } catch (err: any) {
        console.error("Load compliance guard failed", err);
        toast.error(err?.message || "Failed to load compliance guard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateForm = (changes: Partial<GuardConfig>) => {
    setForm((prev) => (prev ? { ...prev, ...changes } : prev));
  };

  const addPhrase = () => {
    if (!form) return;
    const value = newPhrase.trim();
    if (!value || form.forbid_phrases.includes(value)) return;
    updateForm({ forbid_phrases: [...form.forbid_phrases, value] });
    setNewPhrase("");
  };

  const removePhrase = (phrase: string) => {
    if (!form) return;
    updateForm({
      forbid_phrases: form.forbid_phrases.filter((p) => p !== phrase),
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/compliance/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save guard settings");
      }
      const cfg: GuardConfig = {
        ...data.config,
        forbid_phrases: Array.isArray(data.config?.forbid_phrases)
          ? data.config.forbid_phrases
          : [],
      };
      setConfig(cfg);
      setForm(cfg);
      toast.success("Compliance Guard settings saved");
    } catch (err: any) {
      console.error("Save compliance guard failed", err);
      toast.error(err?.message || "Failed to save guard settings");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!form || !form.owner_id || !testDraft.trim()) {
      toast.error("Add some draft text to test");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/functions/v1/nudge-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: form.owner_id,
          draft: testDraft,
          vars: {
            my_meeting_link: form.my_meeting_link ?? undefined,
            org_address: form.org_address ?? undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Guard test failed");
      }
      setTestResult({
        blocked: Boolean(data.blocked),
        draft: typeof data.draft === "string" ? data.draft : testDraft,
        issues: Array.isArray(data.issues) ? data.issues : [],
      });
    } catch (err: any) {
      console.error("Compliance guard test failed", err);
      toast.error(err?.message || "Guard test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading || !form) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Loading Compliance Guard…</div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Compliance Guard</h2>
        <p className="text-sm text-muted-foreground">
          Auto-sanitize AI nudges before they reach the composer or send queue. Adjust the guardrails to match your brand voice and compliance policy.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Require CTA</div>
                <p className="text-xs text-muted-foreground">
                  Ensure every draft includes a call-to-action.
                </p>
              </div>
              <Switch
                checked={form.require_cta}
                onCheckedChange={(checked) => updateForm({ require_cta: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Require unsubscribe line</div>
                <p className="text-xs text-muted-foreground">
                  Append opt-out language if missing.
                </p>
              </div>
              <Switch
                checked={form.require_unsubscribe_line}
                onCheckedChange={(checked) => updateForm({ require_unsubscribe_line: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Require postal address</div>
                <p className="text-xs text-muted-foreground">
                  Add your mailing address to the footer when absent.
                </p>
              </div>
              <Switch
                checked={form.require_postal_address}
                onCheckedChange={(checked) => updateForm({ require_postal_address: checked })}
              />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <div className="text-sm font-medium">Min words ({form.min_words})</div>
              <Slider
                min={30}
                max={200}
                value={[form.min_words]}
                onValueChange={([value]) => updateForm({ min_words: value })}
              />
            </div>
            <div>
              <div className="text-sm font-medium">Max words ({form.max_words})</div>
              <Slider
                min={60}
                max={400}
                value={[form.max_words]}
                onValueChange={([value]) => updateForm({ max_words: value })}
              />
            </div>
            <div>
              <div className="text-sm font-medium">
                CAPS ratio {(form.block_caps_ratio * 100).toFixed(0)}%
              </div>
              <Slider
                min={5}
                max={80}
                value={[Math.round(form.block_caps_ratio * 100)]}
                onValueChange={([value]) => updateForm({ block_caps_ratio: value / 100 })}
              />
            </div>
            <div>
              <div className="text-sm font-medium">Max links ({form.max_links})</div>
              <Slider
                min={0}
                max={6}
                value={[form.max_links]}
                onValueChange={([value]) => updateForm({ max_links: value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Default meeting link</label>
            <Input
              placeholder="https://cal.com/you"
              value={form.my_meeting_link ?? ""}
              onChange={(e) => updateForm({ my_meeting_link: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Used when the guard auto-inserts a calendar link after missing CTA.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mailing address footer</label>
            <Textarea
              rows={3}
              placeholder="123 Company St, City, ST 12345"
              value={form.org_address ?? ""}
              onChange={(e) => updateForm({ org_address: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Added when drafts are missing a postal address requirement.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Forbidden phrases</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., risk-free"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPhrase();
                  }
                }}
              />
              <Button variant="secondary" onClick={addPhrase}>
                Add
              </Button>
            </div>
            {form.forbid_phrases.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {form.forbid_phrases.map((phrase) => (
                  <span
                    key={phrase}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                  >
                    {phrase}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => removePhrase(phrase)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No custom phrases yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={saving || !hasChanges}>
          {saving ? "Saving…" : hasChanges ? "Save guard settings" : "Saved"}
        </Button>
        <Button variant="secondary" onClick={() => form && setForm(config)} disabled={!hasChanges || saving}>
          Reset
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Test a draft</div>
            <p className="text-xs text-muted-foreground">
              Run a sample through the guard to inspect warnings and auto-fixes.
            </p>
          </div>
          <Button variant="secondary" onClick={runTest} disabled={testing}>
            {testing ? "Testing…" : "Run guard"}
          </Button>
        </div>
        <Textarea
          rows={4}
          placeholder="Paste a draft to see how the guard reacts…"
          value={testDraft}
          onChange={(e) => setTestDraft(e.target.value)}
        />
        {testResult && (
          <div className="space-y-2 rounded-md border bg-muted/50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {testResult.blocked ? "Guard blocked this draft" : "Guard passed"}
              </div>
              <Badge className={testResult.blocked ? severityTone.error : severityTone.info}>
                {testResult.blocked ? "blocked" : "pass"}
              </Badge>
            </div>
            {testResult.issues.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {testResult.issues.map((issue, idx) => (
                  <li key={`${issue.rule}-${idx}`} className="flex items-start gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${severityTone[issue.severity]}`}>
                      {issue.severity}
                    </span>
                    <span>
                      <strong>{issue.rule}</strong> — {issue.msg}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No issues detected.</p>
            )}
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Auto-fixed draft</div>
              <pre className="whitespace-pre-wrap rounded border bg-background p-2 text-xs">
                {testResult.draft}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-medium">Guard audit trail</div>
            <p className="text-xs text-muted-foreground">
              Last 50 guard events recorded for your workspace.
            </p>
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Rule</TH>
                <TH>Severity</TH>
                <TH>Message</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {audit.length === 0 && (
                <TR>
                  <TD colSpan={5} className="text-center text-sm text-muted-foreground">
                    No guard events yet.
                  </TD>
                </TR>
              )}
              {audit.map((row) => {
                const expanded = expandedAuditId === row.id;
                return (
                  <>
                    <TR key={row.id}>
                      <TD>{new Date(row.created_at).toLocaleString()}</TD>
                      <TD className="font-medium">{row.rule}</TD>
                      <TD>
                        <Badge className={severityTone[row.severity]}>{row.severity}</Badge>
                      </TD>
                      <TD>{row.message}</TD>
                      <TD className="text-right">
                        {(row.draft_before || row.draft_after) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedAuditId(expanded ? null : row.id)}
                          >
                            {expanded ? "Hide diff" : "View diff"}
                          </Button>
                        )}
                      </TD>
                    </TR>
                    {expanded && (
                      <TR key={`${row.id}-diff`}>
                        <TD colSpan={5}>
                          <div className="grid gap-4 md:grid-cols-2 text-xs">
                            <div>
                              <div className="mb-1 font-semibold uppercase text-muted-foreground">
                                Before
                              </div>
                              <pre className="whitespace-pre-wrap rounded border bg-background p-2">
                                {row.draft_before || "—"}
                              </pre>
                            </div>
                            <div>
                              <div className="mb-1 font-semibold uppercase text-muted-foreground">
                                After
                              </div>
                              <pre className="whitespace-pre-wrap rounded border bg-background p-2">
                                {row.draft_after || "—"}
                              </pre>
                            </div>
                          </div>
                        </TD>
                      </TR>
                    )}
                  </>
                );
              })}
            </TBody>
          </Table>
        </div>
      </div>
    </Card>
  );
}

















