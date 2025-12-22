"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampaignStep } from "@/app/campaigns/[id]/sequence/SequenceBuilderClient";
import { Trash2, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";

interface StepEditorProps {
  step: CampaignStep | null;
  onSave: (step: CampaignStep) => void;
  onDelete?: () => void;
  campaignId: string;
  planKey: string;
}

export function StepEditor({
  step,
  onSave,
  onDelete,
  campaignId,
  planKey,
}: StepEditorProps) {
  const [editedStep, setEditedStep] = useState<CampaignStep | null>(step);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setEditedStep(step);
  }, [step]);

  if (!editedStep) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 p-6">
        <div className="text-center">
          <p className="text-sm">Select a step to edit</p>
          <p className="text-xs text-gray-400 mt-1">
            Click on a step card to view and edit its details
          </p>
        </div>
      </div>
    );
  }

  const handleConfigChange = (key: string, value: any) => {
    setEditedStep((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        config: {
          ...prev.config,
          [key]: value,
        },
      };
    });
  };

  const handleSave = () => {
    if (editedStep) {
      onSave(editedStep);
    }
  };

  const handleRegenerateWithAI = async () => {
    if (editedStep.step_type !== "email") return;

    setIsGenerating(true);
    try {
      const response = await fetch("/api/ai/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_subject: editedStep.config.subject || "",
          template_body: editedStep.config.body || "",
          contact_id: "", // Will be personalized per contact
          campaign_id: campaignId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate");
      }

      const data = await response.json();
      handleConfigChange("subject", data.subject);
      handleConfigChange("body", data.body);
      toast.success("Email regenerated with AI");
    } catch (error) {
      console.error("Failed to regenerate:", error);
      toast.error("Failed to regenerate email");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">
            Edit Step {editedStep.step_order + 1}
          </h2>
          <p className="text-xs text-gray-500 capitalize">{editedStep.step_type}</p>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Email Step Editor */}
        {editedStep.step_type === "email" && (
          <>
            <div>
              <Label>Subject</Label>
              <Input
                value={editedStep.config.subject || ""}
                onChange={(e) => handleConfigChange("subject", e.target.value)}
                placeholder="Quick question for {{first_name|there}}"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use variables: {`{{first_name}}, {{city}}, {{address}}`}
              </p>
            </div>

            <div>
              <Label>Body</Label>
              <Textarea
                value={editedStep.config.body || ""}
                onChange={(e) => handleConfigChange("body", e.target.value)}
                placeholder="Hi {{first_name|there}},&#10;&#10;I noticed your roof might need attention..."
                rows={10}
                className="mt-1 font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleRegenerateWithAI}
                variant="outline"
                size="sm"
                disabled={isGenerating}
                className="flex-1"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isGenerating ? "Generating..." : "Regenerate with AI"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Load roofing template
                  toast.info("Template loading coming soon");
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                Use Template
              </Button>
            </div>

            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                <strong>Available variables:</strong> {`{{first_name}}, {{address}}, {{city}}, {{roof_type}}, {{carrier}}, {{deductible}}, {{weather_event}}`}
              </p>
            </div>
          </>
        )}

        {/* Delay Step Editor */}
        {editedStep.step_type === "delay" && (
          <>
            <div>
              <Label>Wait Duration</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  value={editedStep.config.duration || 2}
                  onChange={(e) =>
                    handleConfigChange("duration", parseInt(e.target.value) || 0)
                  }
                  className="flex-1"
                  min="1"
                />
                <Select
                  value={editedStep.config.unit || "days"}
                  onValueChange={(value) => handleConfigChange("unit", value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Sequence will wait before proceeding to the next step
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                <strong>Recommended delays:</strong> 2h, 4h, 24h, 2 days, 3 days, 1 week
              </p>
            </div>
          </>
        )}

        {/* Condition Step Editor */}
        {editedStep.step_type === "condition" && (
          <>
            {planKey === "starter" ? (
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-700 font-semibold mb-1">
                  Upgrade Required
                </p>
                <p className="text-xs text-orange-600">
                  Conditions are available in Growth and Domination plans.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <Label>If</Label>
                  <Select
                    value={editedStep.config.condition || "replied"}
                    onValueChange={(value) => handleConfigChange("condition", value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="replied">Homeowner replied</SelectItem>
                      <SelectItem value="bounced">Email bounced</SelectItem>
                      <SelectItem value="hot_lead_score">
                        Hot lead score &gt; 80
                      </SelectItem>
                      <SelectItem value="insurance_email">
                        Insurance email detected
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Then</Label>
                  <Select
                    value={editedStep.config.action || "stop"}
                    onValueChange={(value) => handleConfigChange("action", value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stop">Stop sequence</SelectItem>
                      <SelectItem value="jump">Jump to step</SelectItem>
                      <SelectItem value="switch_sequence">
                        Switch to Insurance Flow
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editedStep.config.action === "jump" && (
                  <div>
                    <Label>Jump to Step</Label>
                    <Input
                      type="number"
                      value={editedStep.config.target || ""}
                      onChange={(e) => handleConfigChange("target", e.target.value)}
                      placeholder="Step number"
                      className="mt-1"
                      min="1"
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Tag Step Editor */}
        {editedStep.step_type === "tag" && (
          <>
            <div>
              <Label>Label</Label>
              <Input
                value={editedStep.config.label || ""}
                onChange={(e) => handleConfigChange("label", e.target.value)}
                placeholder="Not Interested"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Apply this label to leads at this step
              </p>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-2">
                <strong>Common labels:</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {["Not Interested", "Follow Up Later", "Hot Lead", "Cold"].map(
                  (label) => (
                    <button
                      key={label}
                      onClick={() => handleConfigChange("label", label)}
                      className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50"
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Save Button */}
      <div className="p-4 border-t bg-gray-50">
        <Button onClick={handleSave} className="w-full">
          Save Changes
        </Button>
      </div>
    </div>
  );
}
















































