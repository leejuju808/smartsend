"use client";

// Block 75000 — Automation Rule Builder Component

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  action_type: string;
  conditions: Record<string, any>;
  action_payload: Record<string, any>;
  enabled: boolean;
}

interface AutomationRuleBuilderProps {
  workspaceId: string;
  rule?: AutomationRule | null;
  onClose: () => void;
}

const TRIGGER_TYPES = [
  { value: "lead_reply", label: "Lead Replies" },
  { value: "new_lead", label: "New Lead Created" },
  { value: "estimate_uploaded", label: "Estimate Uploaded" },
  { value: "estimate_sent", label: "Estimate Sent" },
  { value: "pipeline_stage_changed", label: "Pipeline Stage Changed" },
  { value: "job_created", label: "Job Created" },
  { value: "job_completed", label: "Job Completed" },
  { value: "safety_flag", label: "Safety Flag Raised" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Send Email" },
  { value: "send_sms", label: "Send SMS" },
  { value: "move_pipeline_stage", label: "Move Pipeline Stage" },
  { value: "create_followup", label: "Create Follow-Up" },
  { value: "assign_team_member", label: "Assign Team Member" },
  { value: "create_job", label: "Create Job" },
  { value: "send_owner_alert", label: "Send Owner Alert" },
  { value: "update_job_status", label: "Update Job Status" },
];

export function AutomationRuleBuilder({
  workspaceId,
  rule,
  onClose,
}: AutomationRuleBuilderProps) {
  const [name, setName] = useState(rule?.name || "");
  const [description, setDescription] = useState(rule?.description || "");
  const [triggerType, setTriggerType] = useState(rule?.trigger_type || "");
  const [actionType, setActionType] = useState(rule?.action_type || "");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [conditions, setConditions] = useState<Record<string, any>>(
    rule?.conditions || {}
  );
  const [actionPayload, setActionPayload] = useState<Record<string, any>>(
    rule?.action_payload || {}
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name || !triggerType || !actionType) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSaving(true);
      const url = rule
        ? `/api/automation/rules/${rule.id}`
        : "/api/automation/rules";
      const method = rule ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          trigger_type: triggerType,
          action_type: actionType,
          conditions,
          action_payload: actionPayload,
          enabled,
        }),
      });

      if (!response.ok) throw new Error("Failed to save rule");

      toast.success(`Rule ${rule ? "updated" : "created"} successfully`);
      onClose();
    } catch (error: any) {
      console.error("Error saving rule:", error);
      toast.error("Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  // Update action payload based on action type
  useEffect(() => {
    if (actionType === "move_pipeline_stage" && !actionPayload.stage_name) {
      setActionPayload({ stage_name: "" });
    } else if (actionType === "create_followup" && !actionPayload.followup_days) {
      setActionPayload({ followup_days: [1, 3, 7] });
    } else if (actionType === "send_owner_alert" && !actionPayload.alert_type) {
      setActionPayload({ alert_type: "info" });
    }
  }, [actionType]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit Automation Rule" : "Create Automation Rule"}
          </DialogTitle>
          <DialogDescription>
            Set up an automation: IF this happens → THEN do that automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">
                Rule Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Auto-Hot Lead Response"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this automation do?"
                rows={2}
              />
            </div>
          </div>

          {/* Trigger */}
          <div className="space-y-4">
            <div>
              <Label>
                Trigger: When should this run? <span className="text-red-500">*</span>
              </Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trigger" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((trigger) => (
                    <SelectItem key={trigger.value} value={trigger.value}>
                      {trigger.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditions (simplified for MVP) */}
            {triggerType === "lead_reply" && (
              <div>
                <Label>Condition: Lead Intent</Label>
                <Select
                  value={conditions.intent || ""}
                  onValueChange={(value) =>
                    setConditions({ ...conditions, intent: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any intent (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any Intent</SelectItem>
                    <SelectItem value="Hot">Hot</SelectItem>
                    <SelectItem value="Warm">Warm</SelectItem>
                    <SelectItem value="Not Interested">Not Interested</SelectItem>
                    <SelectItem value="Ready to book">Ready to book</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="space-y-4">
            <div>
              <Label>
                Action: What should happen? <span className="text-red-500">*</span>
              </Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action-specific configuration */}
            {actionType === "move_pipeline_stage" && (
              <div>
                <Label>Move to Stage</Label>
                <Input
                  value={actionPayload.stage_name || ""}
                  onChange={(e) =>
                    setActionPayload({
                      ...actionPayload,
                      stage_name: e.target.value,
                    })
                  }
                  placeholder="e.g., Estimate Needed"
                />
              </div>
            )}

            {actionType === "create_followup" && (
              <div>
                <Label>Follow-Up Days (comma-separated)</Label>
                <Input
                  value={
                    Array.isArray(actionPayload.followup_days)
                      ? actionPayload.followup_days.join(", ")
                      : ""
                  }
                  onChange={(e) =>
                    setActionPayload({
                      ...actionPayload,
                      followup_days: e.target.value
                        .split(",")
                        .map((d) => parseInt(d.trim()))
                        .filter((d) => !isNaN(d)),
                    })
                  }
                  placeholder="e.g., 1, 3, 7"
                />
              </div>
            )}

            {actionType === "send_owner_alert" && (
              <div>
                <Label>Alert Type</Label>
                <Select
                  value={actionPayload.alert_type || "info"}
                  onValueChange={(value) =>
                    setActionPayload({ ...actionPayload, alert_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enabled"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked as boolean)}
            />
            <Label htmlFor="enabled" className="cursor-pointer">
              Enable this rule immediately
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : rule ? "Update Rule" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



























