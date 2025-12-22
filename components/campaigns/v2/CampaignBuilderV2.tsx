"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SequenceCanvas } from "./SequenceCanvas";
import { StepEditor } from "./StepEditor";
import { SequenceTimeline } from "./SequenceTimeline";
import { CampaignStep } from "./StepCard";
import { ListSelector } from "@/components/campaigns/ListSelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Eye, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

interface CampaignBuilderV2Props {
  campaignId?: string;
  initialCampaign?: {
    id?: string;
    name?: string;
    list_id?: string | null;
    from_email?: string;
    daily_cap?: number;
    send_window_start?: string;
    send_window_end?: string;
    warmup_mode?: boolean;
  };
}

// Smart default 4-step sequence for roofers
const DEFAULT_ROOFING_SEQUENCE: Omit<CampaignStep, "id">[] = [
  {
    step_order: 1,
    type: "email",
    subject: "Quick question for {{first_name|there}} at {{company|your team}}",
    body: "Hi {{first_name|there}},\n\nI noticed your roof might need attention. Did you want me to check it?\n\nBest,\n{{sender_name}}",
    delay_hours: 0,
    enabled: true,
    personalization_flags: { first_name: true, company: true },
  },
  {
    step_order: 2,
    type: "wait",
    delay_hours: 48, // 2 days
    enabled: true,
  },
  {
    step_order: 3,
    type: "email",
    subject: "Did you want me to check your roof?",
    body: "Hi {{first_name|there}},\n\nJust following up — did you want me to take a quick look at your roof?\n\nBest,\n{{sender_name}}",
    delay_hours: 0,
    enabled: true,
    personalization_flags: { first_name: true },
  },
  {
    step_order: 4,
    type: "wait",
    delay_hours: 72, // 3 days
    enabled: true,
  },
  {
    step_order: 5,
    type: "email",
    subject: "Should I hold off or take a look this week?",
    body: "Hi {{first_name|there}},\n\nShould I hold off or take a look this week?\n\nBest,\n{{sender_name}}",
    delay_hours: 0,
    enabled: true,
    personalization_flags: { first_name: true },
  },
  {
    step_order: 6,
    type: "wait",
    delay_hours: 72, // 3 days
    enabled: true,
  },
  {
    step_order: 7,
    type: "email",
    subject: "Last follow-up from me — want me to check the roof?",
    body: "Hi {{first_name|there}},\n\nLast follow-up from me — want me to check the roof?\n\nBest,\n{{sender_name}}",
    delay_hours: 0,
    enabled: true,
    personalization_flags: { first_name: true },
  },
];

export function CampaignBuilderV2({
  campaignId,
  initialCampaign,
}: CampaignBuilderV2Props) {
  const router = useRouter();
  const [campaign, setCampaign] = useState(initialCampaign || {});
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [selectedStep, setSelectedStep] = useState<CampaignStep | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"saved" | "saving" | "dirty">("saved");
  
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

  // Load campaign and steps
  useEffect(() => {
    if (campaignId) {
      loadCampaign();
      loadSteps();
      loadDraft();
    } else {
      // New campaign - apply smart defaults
      applySmartDefaults();
    }
  }, [campaignId]);

  const loadCampaign = async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign || {});
      }
    } catch (error) {
      console.error("Failed to load campaign:", error);
    }
  };

  const loadSteps = async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/steps`);
      if (res.ok) {
        const data = await res.json();
        const loadedSteps = (data.steps || []).map((s: any) => ({
          ...s,
          step_order: s.step_order || s.step_no || 1,
          type: s.type || "email",
          delay_hours: s.delay_hours || (s.delay_days ? s.delay_days * 24 : 0) || (s.offset_days ? s.offset_days * 24 : 0),
          personalization_flags: s.personalization_flags || {},
          conditions: s.conditions || {},
        }));
        setSteps(loadedSteps);
        if (loadedSteps.length > 0) {
          setSelectedStep(loadedSteps[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load steps:", error);
    }
  };

  const loadDraft = async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/draft`);
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          // Restore from draft
          setCampaign(data.draft.campaign || campaign);
          setSteps(data.draft.steps || steps);
        }
      }
    } catch (error) {
      console.error("Failed to load draft:", error);
    }
  };

  const applySmartDefaults = () => {
    setSteps(DEFAULT_ROOFING_SEQUENCE.map((s, i) => ({ ...s, id: undefined })));
    if (DEFAULT_ROOFING_SEQUENCE.length > 0) {
      setSelectedStep({ ...DEFAULT_ROOFING_SEQUENCE[0], id: undefined });
    }
  };

  // Autosave functionality (every 3 seconds)
  const saveDraft = useCallback(async () => {
    if (!campaignId) return;
    
    const draftData = {
      campaign,
      steps,
    };
    const draftString = JSON.stringify(draftData);
    
    // Skip if nothing changed
    if (draftString === lastSavedRef.current) {
      setAutosaveStatus("saved");
      return;
    }

    setAutosaveStatus("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_data: draftData }),
      });
      
      if (res.ok) {
        lastSavedRef.current = draftString;
        setAutosaveStatus("saved");
      } else {
        setAutosaveStatus("dirty");
      }
    } catch (error) {
      console.error("Failed to save draft:", error);
      setAutosaveStatus("dirty");
    }
  }, [campaignId, campaign, steps]);

  useEffect(() => {
    if (!campaignId) return;
    
    // Clear existing timer
    if (autosaveTimerRef.current) {
      clearInterval(autosaveTimerRef.current);
    }

    // Set up autosave every 3 seconds
    autosaveTimerRef.current = setInterval(() => {
      saveDraft();
    }, 3000);

    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
      }
    };
  }, [campaignId, saveDraft]);

  const handleStepSave = async (step: CampaignStep) => {
    if (!campaignId) {
      // For new campaigns, just update local state
      setSteps((prev) => {
        const updated = prev.map((s) =>
          (s.id || `step-${s.step_order}`) === (step.id || `step-${step.step_order}`)
            ? step
            : s
        );
        return updated;
      });
      setSelectedStep(step);
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: step.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...step,
          campaign_id: campaignId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const savedStep = { ...step, id: data.step?.id || step.id };
        setSteps((prev) =>
          prev.map((s) =>
            (s.id || `step-${s.step_order}`) === (savedStep.id || `step-${savedStep.step_order}`)
              ? savedStep
              : s
          )
        );
        setSelectedStep(savedStep);
      }
    } catch (error) {
      console.error("Failed to save step:", error);
    }
  };

  const handleStepReorder = async (reorderedSteps: CampaignStep[]) => {
    setSteps(reorderedSteps);
    
    if (!campaignId) return;

    // Save new order
    try {
      const orderedIds = reorderedSteps
        .filter((s) => s.id)
        .map((s) => s.id!);

      if (orderedIds.length === 0) return;

      await fetch(`/api/campaigns/${campaignId}/steps/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_step_ids: orderedIds }),
      });

      // Reload to get updated step_order values
      await loadSteps();
    } catch (error) {
      console.error("Failed to reorder steps:", error);
    }
  };

  const handleAddStep = () => {
    const newStep: CampaignStep = {
      step_order: steps.length + 1,
      type: "email",
      subject: "",
      body: "",
      delay_hours: 0,
      enabled: true,
      personalization_flags: {},
      conditions: {},
    };
    setSteps([...steps, newStep]);
    setSelectedStep(newStep);
  };

  const handleStepDelete = async (stepId: string) => {
    if (!campaignId) {
      setSteps((prev) => prev.filter((s) => (s.id || `step-${s.step_order}`) !== stepId));
      setSelectedStep(null);
      return;
    }

    try {
      await fetch(`/api/campaigns/${campaignId}/steps/${stepId}`, {
        method: "DELETE",
      });
      await loadSteps();
      setSelectedStep(null);
    } catch (error) {
      console.error("Failed to delete step:", error);
    }
  };

  const handleSaveCampaign = async () => {
    setSaving(true);
    try {
      const payload = {
        ...campaign,
        steps: steps.map((s) => ({
          step_order: s.step_order,
          type: s.type,
          subject: s.subject,
          body: s.body,
          delay_hours: s.delay_hours,
          enabled: s.enabled,
          personalization_flags: s.personalization_flags,
          conditions: s.conditions,
        })),
      };

      const url = campaignId
        ? `/api/campaigns/${campaignId}`
        : "/api/campaigns";
      const method = campaignId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (!campaignId && data.campaign?.id) {
          router.push(`/campaigns/${data.campaign.id}/edit`);
        }
      }
    } catch (error) {
      console.error("Failed to save campaign:", error);
    } finally {
      setSaving(false);
    }
  };

  const estimatedSends = campaign.list_id
    ? "Calculating..."
    : "Select a list to see estimated sends";

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {campaignId ? "Edit Campaign" : "New Campaign"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Build your multi-step outreach sequence
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">
              {autosaveStatus === "saving" && "Saving..."}
              {autosaveStatus === "saved" && "Saved"}
              {autosaveStatus === "dirty" && "Unsaved changes"}
            </div>
            <Button
              onClick={() => setShowTimeline(!showTimeline)}
              variant="outline"
              size="sm"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Timeline
            </Button>
            <Button onClick={handleSaveCampaign} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Campaign"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - 3 Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Lists + Settings */}
        <div className="w-80 border-r bg-white overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Campaign Settings
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label>Campaign Name</Label>
                <Input
                  value={campaign.name || ""}
                  onChange={(e) =>
                    setCampaign({ ...campaign, name: e.target.value })
                  }
                  placeholder="Fall Roofing Campaign"
                />
              </div>

              {campaignId && (
                <div>
                  <ListSelector
                    campaignId={campaignId}
                    value={campaign.list_id || null}
                    onChange={(listId) =>
                      setCampaign({ ...campaign, list_id: listId })
                    }
                  />
                </div>
              )}

              <div>
                <Label>Sending Email</Label>
                <Input
                  value={campaign.from_email || ""}
                  onChange={(e) =>
                    setCampaign({ ...campaign, from_email: e.target.value })
                  }
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <Label>Daily Send Limit</Label>
                <Input
                  type="number"
                  value={campaign.daily_cap || 50}
                  onChange={(e) =>
                    setCampaign({
                      ...campaign,
                      daily_cap: parseInt(e.target.value) || 50,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Time Window Start</Label>
                  <Input
                    type="time"
                    value={campaign.send_window_start || "09:00"}
                    onChange={(e) =>
                      setCampaign({
                        ...campaign,
                        send_window_start: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Time Window End</Label>
                  <Input
                    type="time"
                    value={campaign.send_window_end || "17:00"}
                    onChange={(e) =>
                      setCampaign({
                        ...campaign,
                        send_window_end: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={campaign.warmup_mode || false}
                  onCheckedChange={(checked) =>
                    setCampaign({ ...campaign, warmup_mode: !!checked })
                  }
                />
                <Label>Warm-Up Mode</Label>
              </div>

              <div>
                <Label>Safety Status</Label>
                <Badge variant="outline" className="mt-1">
                  {campaign.warmup_mode ? "Warm-Up Active" : "Normal"}
                </Badge>
              </div>

              <div>
                <Label className="text-xs text-gray-500">
                  Estimated Sends: {estimatedSends}
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Center - Sequence Canvas */}
        <div className="flex-1 overflow-y-auto p-6">
          <SequenceCanvas
            steps={steps}
            selectedStepId={
              selectedStep?.id || (selectedStep ? `step-${selectedStep.step_order}` : undefined)
            }
            onStepSelect={setSelectedStep}
            onStepReorder={handleStepReorder}
            onAddStep={handleAddStep}
            onStepEdit={setSelectedStep}
          />
        </div>

        {/* Right Sidebar - Step Editor */}
        <div className="w-96 border-l bg-white overflow-y-auto p-6">
          <StepEditor
            step={selectedStep}
            onSave={handleStepSave}
            onDelete={handleStepDelete}
            campaignId={campaignId}
          />
        </div>
      </div>

      {/* Timeline Modal */}
      {showTimeline && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Sequence Timeline</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTimeline(false)}
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <SequenceTimeline steps={steps} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}





















































