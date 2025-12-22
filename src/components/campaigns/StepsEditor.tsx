"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { StepPreview } from "@/components/campaigns/StepPreview";
import { NextSendChip } from "@/components/campaigns/NextSendChip";
import PreviewNextSend from "@/components/campaigns/PreviewNextSend";
import { FollowupPreviewCard } from "@/components/campaigns/FollowupPreviewCard";
import { FollowupTimelineCard } from "@/components/campaigns/FollowupTimelineCard";
import { StepVariantsPanel } from "@/components/campaigns/StepVariantsPanel";
import { ABVariantEditor } from "@/components/campaigns/ABVariantEditor";
import { StepFollowupEditor } from "@/components/campaigns/StepFollowupEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import Spinner from "@/components/ui/Spinner";
import { StepStats } from "@/components/campaigns/StepStats";
import { VariantStats } from "@/components/campaigns/VariantStats";
import { ABVariantAnalytics } from "@/components/campaigns/ABVariantAnalytics";
import { SequenceFunnel } from "@/components/campaigns/SequenceFunnel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedStepEditor } from "@/components/editor/v2/EnhancedStepEditor";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortableStepItem from "@/components/campaigns/SortableStepItem";

// Simple preview button using new preview-content API
function PreviewWithLeadButton({ campaignId, stepNo }: { campaignId: string; stepNo: number }) {
  const [loading, setLoading] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [leads, setLeads] = useState<Array<{ id: string; email: string }>>([]);

  useEffect(() => {
    async function load() {
      const r = await fetch(`/api/campaigns/${campaignId}/leads/basic?limit=50`);
      const j = await r.json();
      if (r.ok) setLeads(j.leads || []);
    }
    load();
  }, [campaignId]);

  async function preview() {
    if (!leadId) {
      alert("Please select a lead first");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `/api/scheduler/preview-content?campaign=${campaignId}&step=${stepNo}&lead=${leadId}`,
        { credentials: "include" }
      );
      const j = await r.json();
      if (!j) {
        alert("No template found.");
        return;
      }
      const v = j.variant_name ? `Variant ${j.variant_name}` : "Default";
      alert(`${v}\n\nSubject:\n${j.subject}\n\n---\nHTML:\n${j.body_html}`);
    } catch (e) {
      alert("Preview failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={leadId}
        onChange={(e) => setLeadId(e.target.value)}
        className="text-xs border rounded px-2 py-1"
        style={{ maxWidth: "150px" }}
      >
        <option value="">Select lead...</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>
            {l.email}
          </option>
        ))}
      </select>
      <Button size="sm" variant="outline" onClick={preview} disabled={loading || !leadId}>
        {loading ? "Loading..." : "Preview as lead"}
      </Button>
    </div>
  );
}

type Step = {
  id?: string;
  step_no: number; enabled: boolean; offset_days: number;
  subject_template?: string|null; body_html_template?: string|null;
  send_start?: string|null; send_end?: string|null;
  sender_mode?: 'single' | 'rotation' | null;
  sender_inbox_id?: string | null;
  rotation_domain_id?: string | null;
  has_variants?: boolean;
  // Block 11600: A/B testing variant fields
  enable_variant?: boolean;
  subject_b?: string|null;
  body_html_template_b?: string|null;
  variant_split?: number;
  // Block 14300: Auto Follow-up fields
  followup_enabled?: boolean;
  followup_delay_days?: number;
  followup_condition?: string;
  followup_subject_template?: string|null;
  followup_body_template?: string|null;
  // Block 15400: AI Personalization fields
  ai_personalization_enabled?: boolean;
  ai_personalization_mode?: 'opener_only';
};

export function StepsEditor({ campaignId }: { campaignId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [domains, setDomains] = useState<Array<{ id: string; domain: string }>>([]);
  const [inboxes, setInboxes] = useState<Array<{ id: string; email: string; domain_id: string }>>([]);
  
  // AI Optimizer state
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [optimizerGoal, setOptimizerGoal] = useState("book a short call");
  const [optimizerTone, setOptimizerTone] = useState("professional");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedSequence, setOptimizedSequence] = useState<{ steps: Array<{ subject: string; body: string; delay_days: number }>; notes?: string[] } | null>(null);

  async function load() {
    const r = await fetch(`/api/campaigns/${campaignId}/steps`); 
    const j = await r.json();
    if (r.ok) setSteps(j.steps || []);
    
    // Load domains and inboxes for rotation
    const domainsRes = await fetch(`/api/campaigns/${campaignId}/sender-domains`);
    const domainsJson = await domainsRes.json();
    if (domainsRes.ok) setDomains(domainsJson.domains || []);
    
    const inboxesRes = await fetch(`/api/campaigns/${campaignId}/sender-inboxes`);
    const inboxesJson = await inboxesRes.json();
    if (inboxesRes.ok) setInboxes(inboxesJson.inboxes || []);
  }

  useEffect(()=>{ load(); }, [campaignId]);

  function set(idx: number, patch: Partial<Step>) {
    setSteps(s => s.map((row, i) => i===idx ? { ...row, ...patch } : row));
  }

  async function save(s: Step) {
    const r = await fetch(`/api/campaigns/${campaignId}/steps`, {
      method: "POST", headers: { "content-type":"application/json" },
      body: JSON.stringify({ ...s, campaign_id: campaignId })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Save failed");
  }

  async function addDefault(step_no: number) {
    const s: Step = { step_no, enabled: true, offset_days: 2, subject_template: "", body_html_template: "" };
    setSteps(prev => [...prev, s].sort((a,b)=>a.step_no-b.step_no));
    await save(s);
  }

  async function saveOrder(newItems: Step[]) {
    const orderedIds = newItems
      .filter(s => s.id) // Only include steps that have been saved (have an id)
      .map((s) => s.id!);

    if (orderedIds.length === 0) {
      return; // No steps to reorder
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/steps/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_step_ids: orderedIds }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save order");
      }

      // Reload steps to get updated step_no values
      await load();
    } catch (error: any) {
      console.error("Failed to save step order:", error);
      alert(`Failed to save step order: ${error.message}`);
      // Reload to restore original order
      await load();
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSteps((items) => {
      const sortedItems = [...items].sort((a, b) => a.step_no - b.step_no);
      const oldIndex = sortedItems.findIndex((i) => (i.id || `step-${i.step_no}`) === active.id);
      const newIndex = sortedItems.findIndex((i) => (i.id || `step-${i.step_no}`) === over.id);

      if (oldIndex === -1 || newIndex === -1) return items;

      const newItems = arrayMove(sortedItems, oldIndex, newIndex);
      
      // Save the new order asynchronously
      saveOrder(newItems);

      return newItems;
    });
  }

  async function generate(from_step: number) {
    const r = await fetch(`/api/campaigns/${campaignId}/followups/generate`, {
      method: "POST", headers: { "content-type":"application/json" },
      body: JSON.stringify({ from_step })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Generate failed");
    alert(`Queued ${j.queued} follow-ups for Step ${from_step+1}`);
  }

  // Extract variables from text
  function extractVariables(text: string): string[] {
    const matches = text.match(/\{\{[^}]+\}\}/g) || [];
    return [...new Set(matches)];
  }

  // Check if all variables are preserved
  function checkVariables(originalSteps: Step[], optimizedSteps: Array<{ subject: string; body: string }>): { valid: boolean; missing: string[] } {
    const originalVars = new Set<string>();
    originalSteps.forEach(step => {
      const subjectVars = extractVariables(step.subject_template || "");
      const bodyVars = extractVariables(step.body_html_template || "");
      subjectVars.forEach(v => originalVars.add(v));
      bodyVars.forEach(v => originalVars.add(v));
    });

    const optimizedVars = new Set<string>();
    optimizedSteps.forEach(step => {
      const subjectVars = extractVariables(step.subject);
      const bodyVars = extractVariables(step.body);
      subjectVars.forEach(v => optimizedVars.add(v));
      bodyVars.forEach(v => optimizedVars.add(v));
    });

    const missing = Array.from(originalVars).filter(v => !optimizedVars.has(v));
    return { valid: missing.length === 0, missing };
  }

  async function optimizeSequence() {
    if (steps.length === 0) {
      alert("No steps to optimize");
      return;
    }

    setOptimizing(true);
    setOptimizedSequence(null);

    try {
      const sequence = steps
        .sort((a, b) => a.step_no - b.step_no)
        .map(step => ({
          step_no: step.step_no,
          subject: step.subject_template || "",
          body: step.body_html_template || "",
          delay_days: step.offset_days || 0,
        }));

      const response = await fetch("/api/sequence/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence,
          goal: optimizerGoal,
          tone: optimizerTone,
          campaignId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to optimize sequence");
      }

      // Validate variables
      const validation = checkVariables(steps, data.steps);
      if (!validation.valid) {
        alert(`Warning: Some template variables were removed: ${validation.missing.join(", ")}\n\nPlease review the optimized sequence carefully.`);
      }

      setOptimizedSequence(data);
    } catch (error: any) {
      alert(`Optimization failed: ${error.message}`);
    } finally {
      setOptimizing(false);
    }
  }

  async function applyOptimizedSequence() {
    if (!optimizedSequence || !optimizedSequence.steps) {
      return;
    }

    try {
      const sortedSteps = steps.sort((a, b) => a.step_no - b.step_no);
      
      // Update each step
      for (let i = 0; i < optimizedSequence.steps.length; i++) {
        const optimizedStep = optimizedSequence.steps[i];
        const existingStep = sortedSteps[i];

        if (existingStep) {
          // Update existing step
          const updatedStep = {
            ...existingStep,
            subject_template: optimizedStep.subject,
            body_html_template: optimizedStep.body,
            offset_days: optimizedStep.delay_days,
          };
          
          await save(updatedStep);
          setSteps(prev => prev.map(s => s.step_no === existingStep.step_no ? updatedStep : s));
        } else {
          // Create new step if AI added more steps
          const newStep: Step = {
            step_no: sortedSteps.length + 1,
            enabled: true,
            offset_days: optimizedStep.delay_days,
            subject_template: optimizedStep.subject,
            body_html_template: optimizedStep.body,
          };
          await save(newStep);
          setSteps(prev => [...prev, newStep]);
        }
      }

      // Reload to ensure consistency
      await load();
      setShowOptimizer(false);
      setOptimizedSequence(null);
      alert("Sequence optimized and applied successfully!");
    } catch (error: any) {
      alert(`Failed to apply optimized sequence: ${error.message}`);
    }
  }

  return (
    <>
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Follow-up Steps</div>
        <Button 
          onClick={() => {
            setShowOptimizer(true);
            setOptimizedSequence(null);
          }}
          variant="default"
          size="sm"
        >
          ✨ AI Optimize Sequence
        </Button>
      </div>

      <FollowupPreviewCard campaignId={campaignId} />
      <FollowupTimelineCard campaignId={campaignId} />

      {/* Sequence Funnel View */}
      <SequenceFunnel campaignId={campaignId} />

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={steps
            .sort((a, b) => a.step_no - b.step_no)
            .map((s) => s.id || `step-${s.step_no}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {steps.sort((a,b)=>a.step_no-b.step_no).map((s, idx) => (
              <SortableStepItem key={s.id || `step-${s.step_no}`} step={s}>
                <div className="border rounded-md p-3 space-y-4">
          <Tabs defaultValue="edit" className="w-full">
            <TabsList>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-semibold">Step {s.step_no}</div>
            <div className="flex items-center gap-2">
              <Checkbox checked={s.enabled} onCheckedChange={v=>set(idx, { enabled: Boolean(v) })}/>
              <Label className="text-xs">Enabled</Label>
            </div>
            {/* Block 11600: A/B Testing Variant Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox 
                checked={s.enable_variant || false} 
                onCheckedChange={v=>{
                  const enable = Boolean(v);
                  set(idx, { 
                    enable_variant: enable,
                    // Clear variant B fields if disabling
                    ...(enable ? {} : { subject_b: null, body_html_template_b: null })
                  });
                }}
              />
              <Label className="text-xs">A/B Test Variants</Label>
            </div>
            {/* Block 15400: AI Personalization Toggle */}
            <div className="flex items-center gap-2">
              <Checkbox 
                checked={s.ai_personalization_enabled || false} 
                onCheckedChange={v=>{
                  set(idx, { 
                    ai_personalization_enabled: Boolean(v),
                    ai_personalization_mode: Boolean(v) ? 'opener_only' : undefined
                  });
                }}
              />
              <div className="flex flex-col">
                <Label className="text-xs">Use AI to personalize opener</Label>
                <span className="text-xs text-gray-500">Adds local intro line using city & profile</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Offset (days)</Label>
              <Input className="w-20" type="number" min={1} value={s.offset_days}
                onChange={e=>set(idx, { offset_days: Number(e.target.value||1) })}/>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Window</Label>
              <Input placeholder="09:00" className="w-24" value={s.send_start||""} onChange={e=>set(idx,{send_start:e.target.value||null})}/>
              <span className="text-xs">to</span>
              <Input placeholder="17:00" className="w-24" value={s.send_end||""} onChange={e=>set(idx,{send_end:e.target.value||null})}/>
            </div>
            <Button size="sm" variant="outline" onClick={()=>save(s)}>Save</Button>
            {/** NEW: Preview button */}
            <StepPreview campaignId={campaignId} stepNo={s.step_no} />
            <PreviewWithLeadButton campaignId={campaignId} stepNo={s.step_no} />
            {/** NEW: Next send preview chip */}
            <NextSendChip campaignId={campaignId} stepNo={s.step_no} />
            <Button size="sm" variant="secondary"
              onClick={()=>{
                const u = new URL(`/api/campaigns/${campaignId}/followups/dry-run.csv`, window.location.origin);
                u.searchParams.set("from_step", String(s.step_no));
                u.searchParams.set("limit", "50");
                window.location.href = u.toString(); // triggers download
              }}>
              Dry-run (CSV)
            </Button>
                {s.step_no >= 1 && <Button size="sm" onClick={()=>generate(s.step_no)}>Generate next (→ Step {s.step_no+1})</Button>}
              </div>
              {/* Block 11600: Variant Editor */}
              {s.enable_variant ? (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">A/B Variants</Label>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Split:</Label>
                      <Input 
                        className="w-16" 
                        type="number" 
                        min={0} 
                        max={100} 
                        value={s.variant_split ?? 50}
                        onChange={e=>set(idx, { variant_split: Math.max(0, Math.min(100, Number(e.target.value) || 50)) })}
                      />
                      <span className="text-xs">% A / {100 - (s.variant_split ?? 50)}% B</span>
                    </div>
                  </div>
                  <Tabs defaultValue="variant-a" className="w-full">
                    <TabsList>
                      <TabsTrigger value="variant-a">Variant A</TabsTrigger>
                      <TabsTrigger value="variant-b">Variant B</TabsTrigger>
                    </TabsList>
                    <TabsContent value="variant-a" className="space-y-3 mt-3">
                      <EnhancedStepEditor
                        subject={s.subject_template || ""}
                        body={s.body_html_template || ""}
                        onSubjectChange={(val) => set(idx, { subject_template: val })}
                        onBodyChange={(val) => set(idx, { body_html_template: val })}
                      />
                    </TabsContent>
                    <TabsContent value="variant-b" className="space-y-3 mt-3">
                      <EnhancedStepEditor
                        subject={s.subject_b || ""}
                        body={s.body_html_template_b || ""}
                        onSubjectChange={(val) => set(idx, { subject_b: val })}
                        onBodyChange={(val) => set(idx, { body_html_template_b: val })}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="space-y-4">
                  <EnhancedStepEditor
                    subject={s.subject_template || ""}
                    body={s.body_html_template || ""}
                    onSubjectChange={(val) => set(idx, { subject_template: val })}
                    onBodyChange={(val) => set(idx, { body_html_template: val })}
                  />
                  {/* Block 14300: Auto Follow-up Editor */}
                  <StepFollowupEditor
                    followupEnabled={s.followup_enabled || false}
                    followupDelayDays={s.followup_delay_days || 3}
                    followupCondition={s.followup_condition || "no_reply"}
                    followupSubject={s.followup_subject_template || ""}
                    followupBody={s.followup_body_template || ""}
                    onChange={(updates) => set(idx, updates)}
                  />
                </div>
              )}
            </TabsContent>
            <TabsContent value="analytics" className="space-y-4">
              {s.id ? (
                <>
                  <StepStats campaignId={campaignId} stepId={s.id} stepNo={s.step_no} />
                  {/* Block 11600: Show variant analytics if variants are enabled */}
                  {(s.enable_variant || s.has_variants) && (
                    <ABVariantAnalytics 
                      campaignId={campaignId} 
                      stepId={s.id} 
                      stepNo={s.step_no} 
                    />
                  )}
                  <VariantStats stepId={s.id} campaignId={campaignId} />
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Save the step first to view analytics
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          {/* Sender Settings Section */}
          <div className="border-t pt-3 mt-3 space-y-3">
            <Label className="text-xs font-semibold">Sender Settings</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <Label className="text-xs">Send From:</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`single-${idx}`}
                    name={`sender-mode-${idx}`}
                    checked={s.sender_mode === 'single' || !s.sender_mode}
                    onChange={() => set(idx, { sender_mode: 'single', rotation_domain_id: null })}
                  />
                  <Label htmlFor={`single-${idx}`} className="text-xs cursor-pointer">Specific Inbox</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`rotation-${idx}`}
                    name={`sender-mode-${idx}`}
                    checked={s.sender_mode === 'rotation'}
                    onChange={() => set(idx, { sender_mode: 'rotation', sender_inbox_id: null })}
                  />
                  <Label htmlFor={`rotation-${idx}`} className="text-xs cursor-pointer">Rotate Inboxes (Auto)</Label>
                </div>
              </div>
              
              {s.sender_mode === 'single' || !s.sender_mode ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Inbox:</Label>
                  <select
                    className="text-xs border rounded px-2 py-1 flex-1"
                    value={s.sender_inbox_id || ""}
                    onChange={e => set(idx, { sender_inbox_id: e.target.value || null })}
                  >
                    <option value="">Select inbox...</option>
                    {inboxes.map(inbox => (
                      <option key={inbox.id} value={inbox.id}>{inbox.email}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Domain:</Label>
                  <select
                    className="text-xs border rounded px-2 py-1 flex-1"
                    value={s.rotation_domain_id || ""}
                    onChange={e => set(idx, { rotation_domain_id: e.target.value || null })}
                  >
                    <option value="">Select domain...</option>
                    {domains.map(domain => (
                      <option key={domain.id} value={domain.id}>{domain.domain}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          
          <PreviewNextSend campaignId={campaignId} stepNo={s.step_no} />
          {s.id && (
            <>
              <ABVariantEditor 
                stepId={s.id} 
                stepNo={s.step_no} 
                campaignId={campaignId}
                defaultSubject={s.subject_template}
                defaultBody={s.body_html_template}
              />
              <StepVariantsPanel stepId={s.id} stepNo={s.step_no} />
            </>
          )}
                </div>
              </SortableStepItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={()=>addDefault(2)}>Add Step 2</Button>
        <Button variant="secondary" onClick={()=>addDefault(3)}>Add Step 3</Button>
      </div>
    </Card>

    {/* AI Sequence Optimizer Modal */}
    <Dialog open={showOptimizer} onOpenChange={setShowOptimizer}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Sequence Optimizer</DialogTitle>
          <DialogDescription>
            Rewrite your entire multi-step sequence for maximum reply rate.
          </DialogDescription>
        </DialogHeader>

        {!optimizedSequence && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Goal</Label>
              <select
                value={optimizerGoal}
                onChange={(e) => setOptimizerGoal(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="book a short call">Book a short call</option>
                <option value="schedule a demo">Schedule a demo</option>
                <option value="request a quote">Request a quote</option>
                <option value="get a response">Get a response</option>
                <option value="maximize reply rate">Maximize reply rate</option>
              </select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Tone</Label>
              <select
                value={optimizerTone}
                onChange={(e) => setOptimizerTone(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="SMB">SMB (Small Business)</option>
                <option value="conversational">Conversational</option>
                <option value="direct">Direct</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </div>

            <Button
              onClick={optimizeSequence}
              disabled={optimizing || steps.length === 0}
              className="w-full"
            >
              {optimizing ? (
                <>
                  <Spinner size={16} className="mr-2" />
                  Optimizing...
                </>
              ) : (
                "Optimize Sequence"
              )}
            </Button>
          </div>
        )}

        {optimizing && !optimizedSequence && (
          <div className="flex flex-col items-center justify-center py-8">
            <Spinner size={32} />
            <p className="mt-4 text-sm text-muted-foreground">Analyzing and optimizing your sequence...</p>
          </div>
        )}

        {optimizedSequence && (
          <div className="space-y-4">
            {optimizedSequence.notes && optimizedSequence.notes.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <h4 className="text-sm font-semibold mb-2">Optimization Notes:</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {optimizedSequence.notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {optimizedSequence.steps.map((step, idx) => (
                <div key={idx} className="border rounded-md p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Step {idx + 1}</h4>
                    <span className="text-xs text-muted-foreground">
                      Delay: {step.delay_days} days
                    </span>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <div className="text-sm font-medium mt-1">{step.subject}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Body</Label>
                    <div 
                      className="text-sm mt-1 max-h-32 overflow-y-auto prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: step.body }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowOptimizer(false);
                  setOptimizedSequence(null);
                }}
              >
                Keep Original
              </Button>
              <Button onClick={applyOptimizedSequence}>
                Apply Optimized Sequence
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
