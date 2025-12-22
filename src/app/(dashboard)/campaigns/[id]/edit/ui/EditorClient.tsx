"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { ComposerToolbar } from "@/components/ComposerToolbar";
import { StepsEditor } from "@/components/campaigns/StepsEditor";
import { StepMetrics } from "@/components/campaigns/StepMetrics";
import { VariantEditor } from "@/components/campaigns/VariantEditor";
import { SmartRewriteButton } from "@/components/templates/SmartRewriteButton";
import { RewriteVariantsModal } from "@/components/templates/RewriteVariantsModal";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MergeFieldSuggestions } from "@/components/campaigns/MergeFieldSuggestions";
import { previewTemplate } from "@/app/actions/previewTemplate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FollowUpBuilder } from "@/components/campaigns/FollowUpBuilder";
// import { toast } from "sonner";

type Campaign = {
  id: string;
  name: string | null;
  subject_tpl: string | null;
  text_tpl: string | null;
  html_tpl: string | null;
  send_window_start?: string | null;
  send_window_end?: string | null;
  daily_cap?: number | null;
  throttle_per_minute?: number | null;
  warmup_mode?: boolean | null;
};

const DEFAULTS = {
  subject_tpl: "Quick question for {{first_name|there}} at {{company|your team}}",
  text_tpl: `Hi {{first_name|there}},

We help {{company|teams}} book more meetings from cold outreach.
{{custom1|(Add a 1–2 sentence value prop / proof.)}}

Open to a quick chat this week?

— {{custom2|Your Name}}`,
  html_tpl: `<p>Hi {{first_name|there}},</p>
<p>We help {{company|teams}} book more meetings from cold outreach.<br>
{{custom1|(Add a 1–2 sentence value prop / proof.)}}</p>
<p>Open to a quick chat this week?</p>
<p>— {{custom2|Your Name}}</p>`,
};

export default function EditorClient({ initial }: { initial: Campaign }) {
  const [subject, setSubject] = React.useState(initial.subject_tpl ?? DEFAULTS.subject_tpl);
  const [text, setText] = React.useState(initial.text_tpl ?? DEFAULTS.text_tpl);
  const [html, setHtml] = React.useState(initial.html_tpl ?? DEFAULTS.html_tpl);
  const [saving, setSaving] = React.useState<"idle" | "saving" | "saved">("idle");

  // preview context (lightweight lead fields)
  const [ctx, setCtx] = React.useState({
    first_name: "Alex",
    last_name: "Lee",
    company: "Acme Co",
    title: "Head of Growth",
    website: "https://acme.co",
    custom1: "We increased reply rates by 38% for B2B SaaS.",
    custom2: "Julian @ SmartSend",
    custom3: "",
    email: "alex@acme.co",
  });

  // Debounced autosave
  React.useEffect(() => {
    setSaving("saving");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/campaigns/update-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: initial.id,
            subject_tpl: subject,
            text_tpl: text,
            html_tpl: html,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        setSaving("saved");
        setTimeout(() => setSaving("idle"), 1200);
      } catch (e: any) {
        setSaving("idle");
        console.error(e?.message ?? "Save failed");
        alert(e?.message ?? "Save failed");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [subject, text, html, initial.id]);

  const [tone, setTone] = React.useState("concise");
  const [goal, setGoal] = React.useState("book a short call");
  const [length, setLength] = React.useState("short");
  const [loadingAI, setLoadingAI] = React.useState(false);
  const [activeField, setActiveField] = React.useState<"subject" | "text" | "html">("html");
  const [rewriteVariants, setRewriteVariants] = React.useState<Array<{ subject: string; body: string }>>([]);
  const [variantsModalOpen, setVariantsModalOpen] = React.useState(false);
  const [subjectVariants, setSubjectVariants] = React.useState<Array<{ subject: string; body: string }>>([]);
  const [subjectModalOpen, setSubjectModalOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<{ subject: string; body: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);

  async function handlePreview() {
    setLoadingPreview(true);
    try {
      const result = await previewTemplate(initial.id);
      setPreviewData(result);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Preview error:", error);
      alert("Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleInsertVariable(variable: string) {
    if (activeField === "subject") {
      setSubject(subject + variable);
    } else if (activeField === "text") {
      setText(text + variable);
    } else {
      setHtml(html + variable);
    }
  }

  const handleRewriteResults = (variants: Array<{ subject: string; body: string }>) => {
    setRewriteVariants(variants);
    setVariantsModalOpen(true);
  };

  const handleUseVariant = async (variant: { subject: string; body: string }, action: "replace" | "new_variant") => {
    if (action === "replace") {
      // Replace current template
      setSubject(variant.subject);
      if (variant.body) {
        // Try to detect if body is HTML or plain text
        if (variant.body.includes("<") && variant.body.includes(">")) {
          setHtml(variant.body);
        } else {
          setText(variant.body);
        }
      }
    } else {
      // Save as new variant
      try {
        const res = await fetch(`/api/campaigns/${initial.id}/variants/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String.fromCharCode(65 + Math.floor(Math.random() * 26)), // Random A-Z
            subject: variant.subject,
            body: variant.body,
            weight: 50,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        alert("Variant saved!");
        // Optionally reload variants in VariantEditor
        window.location.reload();
      } catch (e: any) {
        console.error("Failed to save variant:", e);
        alert(e?.message || "Failed to save variant");
      }
    }
  };

  // Scheduler settings state
  const [sendWindowStart, setSendWindowStart] = React.useState(
    initial.send_window_start || "08:00"
  );
  const [sendWindowEnd, setSendWindowEnd] = React.useState(
    initial.send_window_end || "17:00"
  );
  const [dailyCap, setDailyCap] = React.useState(
    initial.daily_cap || 150
  );
  const [throttlePerMinute, setThrottlePerMinute] = React.useState(
    initial.throttle_per_minute || 3
  );
  const [warmupMode, setWarmupMode] = React.useState(
    initial.warmup_mode || false
  );
  const [schedulerSaving, setSchedulerSaving] = React.useState<"idle" | "saving" | "saved">("idle");

  // Save scheduler settings
  const saveSchedulerSettings = React.useCallback(async () => {
    setSchedulerSaving("saving");
    try {
      const res = await fetch(`/api/campaigns/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          send_window_start: sendWindowStart,
          send_window_end: sendWindowEnd,
          daily_cap: dailyCap,
          throttle_per_minute: throttlePerMinute,
          warmup_mode: warmupMode,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSchedulerSaving("saved");
      setTimeout(() => setSchedulerSaving("idle"), 1200);
    } catch (e: any) {
      setSchedulerSaving("idle");
      console.error(e?.message ?? "Save failed");
      alert(e?.message ?? "Save failed");
    }
  }, [initial.id, sendWindowStart, sendWindowEnd, dailyCap, throttlePerMinute, warmupMode]);

  // Debounced save for scheduler settings
  React.useEffect(() => {
    const t = setTimeout(() => {
      saveSchedulerSettings();
    }, 600);
    return () => clearTimeout(t);
  }, [sendWindowStart, sendWindowEnd, dailyCap, throttlePerMinute, warmupMode, saveSchedulerSettings]);

  const [followUps, setFollowUps] = React.useState<{ step2?: any; step3?: any } | null>(null);
  const [loadingFollowUps, setLoadingFollowUps] = React.useState(true);

  // Load follow-ups on mount
  React.useEffect(() => {
    fetch(`/api/campaigns/${initial.id}/followups`)
      .then((res) => res.json())
      .then((data) => {
        setFollowUps(data);
        setLoadingFollowUps(false);
      })
      .catch(() => {
        setLoadingFollowUps(false);
      });
  }, [initial.id]);

  return (
    <Tabs defaultValue="templates" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="steps">Steps</TabsTrigger>
        <TabsTrigger value="followups">Follow-Ups</TabsTrigger>
        <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
      </TabsList>

      <TabsContent value="templates">
        <div className="space-y-6">
          {/* Variants Section */}
          <VariantEditor campaignId={initial.id} />
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Editor */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Templates</CardTitle>
              <div className="text-xs text-muted-foreground">
                {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : "Autosave on"}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="subject">
                <TabsList>
                  <TabsTrigger value="subject">Subject</TabsTrigger>
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                </TabsList>

            <TabsContent value="subject" className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Subject</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger>
                      <Button size="xs" variant="ghost" className="text-xs">
                        ✨ Rewrite
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <SmartRewriteButton
                        subject={subject}
                        body=""
                        onResults={(variants) => {
                          setSubjectVariants(variants);
                          setSubjectModalOpen(true);
                        }}
                        subjectOnly={true}
                      />
                    </PopoverContent>
                  </Popover>
                  <ComposerToolbar onInsertVariable={handleInsertVariable} />
                </div>
              </div>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => setActiveField("subject")} />
              <PlaceholdersHint />
              <MergeFieldSuggestions onInsert={(field) => {
                const input = document.activeElement as HTMLInputElement;
                if (input) {
                  const start = input.selectionStart || 0;
                  const end = input.selectionEnd || 0;
                  const newValue = subject.slice(0, start) + field + subject.slice(end);
                  setSubject(newValue);
                } else {
                  setSubject(subject + field);
                }
              }} />
            </TabsContent>

            <TabsContent value="text" className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Plain Text</Label>
                <ComposerToolbar onInsertVariable={handleInsertVariable} />
              </div>
              <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setActiveField("text")} />
              <PlaceholdersHint />
              <MergeFieldSuggestions onInsert={(field) => {
                const textarea = document.activeElement as HTMLTextAreaElement;
                if (textarea) {
                  const start = textarea.selectionStart || 0;
                  const end = textarea.selectionEnd || 0;
                  const newValue = text.slice(0, start) + field + text.slice(end);
                  setText(newValue);
                } else {
                  setText(text + field);
                }
              }} />
            </TabsContent>

            <TabsContent value="html" className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>HTML</Label>
                <ComposerToolbar onInsertVariable={handleInsertVariable} />
              </div>
              <Textarea rows={12} value={html ?? ""} onChange={(e) => setHtml(e.target.value)} onFocus={() => setActiveField("html")} />
              <PlaceholdersHint />
              <MergeFieldSuggestions onInsert={(field) => {
                const textarea = document.activeElement as HTMLTextAreaElement;
                if (textarea) {
                  const start = textarea.selectionStart || 0;
                  const end = textarea.selectionEnd || 0;
                  const newValue = (html || "").slice(0, start) + field + (html || "").slice(end);
                  setHtml(newValue);
                } else {
                  setHtml((html || "") + field);
                }
              }} />
            </TabsContent>
          </Tabs>

          <div className="flex justify-between items-center mb-2">
            <span className="text-xs opacity-70">
              Use AI to tweak tone, length, and variants.
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePreview}
                disabled={loadingPreview}
              >
                {loadingPreview ? "Loading..." : "Preview for First Lead"}
              </Button>
              <SmartRewriteButton
                subject={subject}
                body={text || html || ""}
                onResults={handleRewriteResults}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(ctx).map(([k, v]) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{k}</Label>
                <Input value={v} onChange={(e)=>setCtx({ ...ctx, [k]: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Subject</div>
              <div className="font-medium">{render(subject, ctx) || <span className="text-muted-foreground">(empty)</span>}</div>
            </div>
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-1">Body (Text)</div>
              <pre className="whitespace-pre-wrap text-sm">{render(text, ctx)}</pre>
            </div>
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground mb-1">Body (HTML)</div>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: render(html || "", ctx) }} />
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </TabsContent>

      <RewriteVariantsModal
        variants={rewriteVariants}
        onUseVariant={handleUseVariant}
        open={variantsModalOpen}
        onClose={() => setVariantsModalOpen(false)}
      />

      <RewriteVariantsModal
        variants={subjectVariants}
        onUseVariant={(variant, action) => {
          if (action === "replace") {
            setSubject(variant.subject);
          } else {
            // For subject-only, "new variant" doesn't make sense, so just replace
            setSubject(variant.subject);
          }
          setSubjectModalOpen(false);
        }}
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
      />

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template Preview (First Lead)</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-1">Subject</div>
                <div className="p-3 bg-muted rounded-md">{previewData.subject || "(empty)"}</div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Body</div>
                <div className="p-3 bg-muted rounded-md prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewData.body || "(empty)" }} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TabsContent value="steps">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <StepsEditor campaignId={initial.id} />
            <StepMetrics campaignId={initial.id} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="followups">
        {loadingFollowUps ? (
          <div className="text-center py-8 text-muted-foreground">Loading follow-ups...</div>
        ) : (
          <FollowUpBuilder
            campaignId={initial.id}
            initialStep2={followUps?.step2}
            initialStep3={followUps?.step3}
          />
        )}
      </TabsContent>

      <TabsContent value="scheduler">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Scheduler Settings</CardTitle>
            <div className="text-xs text-muted-foreground">
              {schedulerSaving === "saving" ? "Saving…" : schedulerSaving === "saved" ? "Saved" : "Autosave on"}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Send Window</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Emails will only be sent during this time window (in the lead's local timezone)
                </p>
                <div className="flex gap-3 items-center">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Start Time</Label>
                    <Input
                      type="time"
                      value={sendWindowStart}
                      onChange={(e) => setSendWindowStart(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">End Time</Label>
                    <Input
                      type="time"
                      value={sendWindowEnd}
                      onChange={(e) => setSendWindowEnd(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Daily Cap</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Maximum number of emails to send per day for this campaign
                </p>
                <Input
                  type="number"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(parseInt(e.target.value) || 150)}
                  min={1}
                  max={10000}
                  className="w-full max-w-xs"
                />
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">Throttle Per Minute</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Maximum number of emails to send per minute (prevents spam bursts)
                </p>
                <Input
                  type="number"
                  value={throttlePerMinute}
                  onChange={(e) => setThrottlePerMinute(parseInt(e.target.value) || 3)}
                  min={1}
                  max={60}
                  className="w-full max-w-xs"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="warmup-mode"
                  checked={warmupMode}
                  onChange={(e) => setWarmupMode(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <Label htmlFor="warmup-mode" className="text-sm font-medium cursor-pointer">
                    Enable Domain Warm-Up
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gradually increase sending volume over 3 weeks to build domain reputation.
                    Week 1: 20/day, Week 2: 40/day, Week 3: 75/day, Week 4+: Full cap
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function PlaceholdersHint() {
  return (
    <div className="text-xs text-muted-foreground">
      Use <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{first_name}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{last_name}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{name}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{company}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{title}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{website}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{email}}"}</code>, <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{custom1}}"}</code>-<code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{custom3}}"}</code>.
      Add fallbacks: <code className="text-xs px-1 py-0.5 rounded bg-muted">{"{{first_name|there}}"}</code>.
    </div>
  );
}

/** Minimal {{var}} or {{var|fallback}} renderer */
function render(tpl?: string | null, ctx: Record<string,string> = {}) {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}\}/g, (_m, key, fb) => {
    const v = (ctx[key] ?? "").toString().trim();
    return v || (fb ? String(fb) : "");
  });
}
