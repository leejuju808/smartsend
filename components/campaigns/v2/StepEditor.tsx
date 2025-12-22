"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CampaignStep, StepType } from "./StepCard";
import { Smartphone, Monitor } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface StepEditorProps {
  step: CampaignStep | null;
  onSave: (step: CampaignStep) => void;
  onDelete?: (stepId: string) => void;
  campaignId?: string;
}

export function StepEditor({ step, onSave, onDelete, campaignId }: StepEditorProps) {
  const [editedStep, setEditedStep] = useState<CampaignStep | null>(step);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    setEditedStep(step);
  }, [step]);

  if (!editedStep) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-sm">Select a step to edit</p>
          <p className="text-xs text-gray-400 mt-1">
            Click on a step card to view and edit its details
          </p>
        </div>
      </div>
    );
  }

  const handleFieldChange = (field: keyof CampaignStep, value: any) => {
    setEditedStep((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handlePersonalizationToggle = (key: string, enabled: boolean) => {
    setEditedStep((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        personalization_flags: {
          ...prev.personalization_flags,
          [key]: enabled,
        },
      };
    });
  };

  const handleSave = () => {
    if (editedStep) {
      onSave(editedStep);
    }
  };

  const formatDelay = (hours: number) => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const delayOptions = [
    { label: "1 hour", value: 1 },
    { label: "6 hours", value: 6 },
    { label: "1 day", value: 24 },
    { label: "2 days", value: 48 },
    { label: "3 days", value: 72 },
    { label: "Custom", value: -1 },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Edit Step {editedStep.step_order}
        </h2>
        {onDelete && editedStep.id && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => editedStep.id && onDelete(editedStep.id)}
          >
            Delete
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Step Type */}
        <div>
          <Label>Step Type</Label>
          <Select
            value={editedStep.type}
            onValueChange={(value: StepType) => handleFieldChange("type", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="wait">Wait (Delay)</SelectItem>
              <SelectItem value="condition">Condition</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Enabled Toggle */}
        <div className="flex items-center gap-2">
          <Checkbox
            checked={editedStep.enabled}
            onCheckedChange={(checked) =>
              handleFieldChange("enabled", checked)
            }
          />
          <Label>Enabled</Label>
        </div>

        {/* Delay Setting */}
        {(editedStep.type === "email" || editedStep.type === "wait") && (
          <div>
            <Label>Delay Before Sending</Label>
            <Select
              value={
                delayOptions.find((opt) => opt.value === editedStep.delay_hours)
                  ? String(editedStep.delay_hours)
                  : "custom"
              }
              onValueChange={(value) => {
                if (value === "custom") {
                  handleFieldChange("delay_hours", 0);
                } else {
                  handleFieldChange("delay_hours", parseInt(value));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {delayOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {editedStep.delay_hours === 0 && (
              <Input
                type="number"
                placeholder="Hours"
                value={editedStep.delay_hours}
                onChange={(e) =>
                  handleFieldChange("delay_hours", parseInt(e.target.value) || 0)
                }
                className="mt-2"
              />
            )}
            {editedStep.delay_hours > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Will wait {formatDelay(editedStep.delay_hours)} before sending
              </p>
            )}
          </div>
        )}

        {/* Email Content */}
        {editedStep.type === "email" && (
          <>
            <div>
              <Label>Subject</Label>
              <Input
                value={editedStep.subject || ""}
                onChange={(e) => handleFieldChange("subject", e.target.value)}
                placeholder="Quick question for {{first_name|there}}"
              />
            </div>

            <div>
              <Label>Body</Label>
              <Textarea
                value={editedStep.body || ""}
                onChange={(e) => handleFieldChange("body", e.target.value)}
                placeholder="Hi {{first_name|there}},&#10;&#10;I noticed your roof might need attention..."
                rows={8}
                className="font-mono text-sm"
              />
            </div>

            {/* Personalization Toggles */}
            <div>
              <Label className="mb-2 block">Personalization</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      editedStep.personalization_flags?.first_name || false
                    }
                    onCheckedChange={(checked) =>
                      handlePersonalizationToggle("first_name", !!checked)
                    }
                  />
                  <Label className="text-sm">First Name</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={editedStep.personalization_flags?.company || false}
                    onCheckedChange={(checked) =>
                      handlePersonalizationToggle("company", !!checked)
                    }
                  />
                  <Label className="text-sm">Company</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={editedStep.personalization_flags?.city || false}
                    onCheckedChange={(checked) =>
                      handlePersonalizationToggle("city", !!checked)
                    }
                  />
                  <Label className="text-sm">City</Label>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Wait Step Display */}
        {editedStep.type === "wait" && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              This step will wait{" "}
              <span className="font-semibold">
                {formatDelay(editedStep.delay_hours)}
              </span>{" "}
              before proceeding to the next step.
            </p>
          </div>
        )}

        {/* Condition Step (Future Feature) */}
        {editedStep.type === "condition" && (
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-purple-700">
              Conditional logic is available in Growth and Domination plans.
            </p>
            <p className="text-xs text-purple-600 mt-1">
              Set conditions like: If homeowner replied → stop, If HOT → alert,
              etc.
            </p>
          </div>
        )}

        {/* Preview */}
        {editedStep.type === "email" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Preview</Label>
              <div className="flex gap-2">
                <Button
                  variant={previewMode === "desktop" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewMode("desktop")}
                >
                  <Monitor className="w-4 h-4" />
                </Button>
                <Button
                  variant={previewMode === "mobile" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewMode("mobile")}
                >
                  <Smartphone className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div
              className={`border rounded-lg p-4 bg-white ${
                previewMode === "mobile" ? "max-w-sm" : "w-full"
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">From: Your Email</div>
              <div className="text-sm font-semibold mb-2">
                {editedStep.subject || "(No subject)"}
              </div>
              <div
                className="text-sm text-gray-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: editedStep.body || "(No body)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-4 pt-4 border-t">
        <Button onClick={handleSave} className="w-full">
          Save Changes
        </Button>
      </div>
    </div>
  );
}





















































