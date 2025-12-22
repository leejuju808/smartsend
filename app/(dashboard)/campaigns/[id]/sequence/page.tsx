"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/src/components/ui/switch";
import { getSequenceSteps } from "@/actions/getSequenceSteps";
import { createSequenceStep } from "@/actions/createSequenceStep";
import { updateSequenceStep } from "@/actions/updateSequenceStep";
import { deleteSequenceStep } from "@/actions/deleteSequenceStep";
import { Trash2, Plus, TrendingUp } from "lucide-react";
import { AIRewriteSubjectField } from "@/components/campaigns/AIRewriteSubjectField";
import { AIRewriteBodyField } from "@/components/campaigns/AIRewriteBodyField";
import { ABTestStats } from "@/components/campaigns/ABTestStats";
import { ABTestStats } from "@/components/campaigns/ABTestStats";

type SequenceStep = {
  id: string;
  campaign_id: string;
  position: number;
  delay_days: number;
  subject: string | null;
  body: string | null;
  subject_variant_a: string | null;
  subject_variant_b: string | null;
  ab_test_enabled: boolean;
  ab_test_winner: string | null;
  created_at: string;
};

export default function SequencePage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSteps();
  }, [campaignId]);

  async function loadSteps() {
    setLoading(true);
    const result = await getSequenceSteps(campaignId);
    if (result.ok) {
      setSteps(result.data);
    }
    setLoading(false);
  }

  async function handleAddStep() {
    const result = await createSequenceStep(campaignId);
    if (result.ok) {
      await loadSteps();
    }
  }

  async function handleUpdateStep(stepId: string, field: string, value: string | number | boolean) {
    setSaving({ ...saving, [stepId]: true });
    const result = await updateSequenceStep(stepId, { [field]: value });
    setSaving({ ...saving, [stepId]: false });
    if (result.ok) {
      await loadSteps();
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm("Are you sure you want to delete this step?")) return;
    const result = await deleteSequenceStep(stepId);
    if (result.ok) {
      await loadSteps();
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Sequence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build multi-step cold email sequences with delays and follow-ups
          </p>
        </div>
        <Button onClick={handleAddStep} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Step
        </Button>
      </div>

      {steps.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No sequence steps yet.</p>
            <Button onClick={handleAddStep}>Create First Step</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {steps.map((step) => (
            <Card key={step.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Step {step.position}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteStep(step.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`delay-${step.id}`}>Delay (days)</Label>
                    <Input
                      id={`delay-${step.id}`}
                      type="number"
                      min="0"
                      value={step.delay_days}
                      onChange={(e) =>
                        handleUpdateStep(step.id, "delay_days", parseInt(e.target.value) || 0)
                      }
                      disabled={saving[step.id]}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {step.position === 1
                        ? "First email sends immediately"
                        : `Waits ${step.delay_days} day${step.delay_days !== 1 ? "s" : ""} after previous step`}
                    </p>
                  </div>
                </div>

                {/* A/B Testing Toggle */}
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`ab-test-${step.id}`}
                      checked={step.ab_test_enabled || false}
                      onCheckedChange={(checked) => {
                        handleUpdateStep(step.id, "ab_test_enabled", checked);
                        // When enabling, copy subject to both variants if they're empty
                        if (checked && (!step.subject_variant_a || !step.subject_variant_b)) {
                          const subject = step.subject || "";
                          if (!step.subject_variant_a) {
                            handleUpdateStep(step.id, "subject_variant_a", subject);
                          }
                          if (!step.subject_variant_b) {
                            handleUpdateStep(step.id, "subject_variant_b", subject);
                          }
                        }
                      }}
                      disabled={saving[step.id]}
                    />
                    <Label htmlFor={`ab-test-${step.id}`} className="cursor-pointer">
                      Enable A/B Subject Test
                    </Label>
                  </div>
                  {step.ab_test_winner && (
                    <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                      <TrendingUp className="w-4 h-4" />
                      Winner: Variant {step.ab_test_winner}
                    </div>
                  )}
                </div>

                {/* Subject Input(s) */}
                {step.ab_test_enabled ? (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor={`subject-a-${step.id}`} className="font-semibold">
                          Subject A
                        </Label>
                        <AIRewriteSubjectField
                          campaignId={campaignId}
                          stepPosition={step.position}
                          value={step.subject_variant_a || ""}
                          onChange={(value) => handleUpdateStep(step.id, "subject_variant_a", value)}
                        />
                      </div>
                      <Input
                        id={`subject-a-${step.id}`}
                        value={step.subject_variant_a || ""}
                        onChange={(e) => handleUpdateStep(step.id, "subject_variant_a", e.target.value)}
                        placeholder="Email subject line - Variant A"
                        disabled={saving[step.id]}
                        className={step.ab_test_winner === "A" ? "border-green-500 bg-green-50" : ""}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor={`subject-b-${step.id}`} className="font-semibold">
                          Subject B
                        </Label>
                        <AIRewriteSubjectField
                          campaignId={campaignId}
                          stepPosition={step.position}
                          value={step.subject_variant_b || ""}
                          onChange={(value) => handleUpdateStep(step.id, "subject_variant_b", value)}
                        />
                      </div>
                      <Input
                        id={`subject-b-${step.id}`}
                        value={step.subject_variant_b || ""}
                        onChange={(e) => handleUpdateStep(step.id, "subject_variant_b", e.target.value)}
                        placeholder="Email subject line - Variant B"
                        disabled={saving[step.id]}
                        className={step.ab_test_winner === "B" ? "border-green-500 bg-green-50" : ""}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      SmartSend will split sends 50/50 and automatically use the winner with higher open rates.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor={`subject-${step.id}`}>Subject</Label>
                      <AIRewriteSubjectField
                        campaignId={campaignId}
                        stepPosition={step.position}
                        value={step.subject || ""}
                        onChange={(value) => handleUpdateStep(step.id, "subject", value)}
                      />
                    </div>
                    <Input
                      id={`subject-${step.id}`}
                      value={step.subject || ""}
                      onChange={(e) => handleUpdateStep(step.id, "subject", e.target.value)}
                      placeholder="Email subject line"
                      disabled={saving[step.id]}
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor={`body-${step.id}`}>Body</Label>
                    <AIRewriteBodyField
                      campaignId={campaignId}
                      stepPosition={step.position}
                      value={step.body || ""}
                      onChange={(value) => handleUpdateStep(step.id, "body", value)}
                    />
                  </div>
                  <Textarea
                    id={`body-${step.id}`}
                    value={step.body || ""}
                    onChange={(e) => handleUpdateStep(step.id, "body", e.target.value)}
                    placeholder="Email body content"
                    rows={8}
                    disabled={saving[step.id]}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use variables like {"{"}first_name{"}"}, {"{"}company{"}"}, etc.
                  </p>
                </div>

                {/* A/B Test Stats */}
                {step.ab_test_enabled && (
                  <ABTestStats
                    campaignId={campaignId}
                    stepId={step.id}
                    stepNo={step.position}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

