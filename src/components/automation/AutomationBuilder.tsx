"use client";

// Block 232000 — Automation Builder Component
// Visual automation builder with trigger selection, conditions, and actions

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Plus, Trash2, Save, Play, Pause } from "lucide-react";

interface AutomationAction {
  id?: string;
  action_type: string;
  action_payload: any;
  sort_order: number;
}

interface Automation {
  id?: string;
  name: string;
  description?: string;
  trigger_type: "event" | "schedule" | "condition";
  trigger_value: string;
  conditions: any;
  actions: AutomationAction[];
  active?: boolean;
}

const TRIGGER_OPTIONS = [
  { value: "proposal_viewed", label: "When proposal is viewed" },
  { value: "contract_signed", label: "When contract is signed" },
  { value: "payment_received", label: "When payment is received" },
  { value: "job_scheduled", label: "When job is scheduled" },
  { value: "materials_delivered", label: "When materials are delivered" },
  { value: "crew_started", label: "When crew starts job" },
  { value: "crew_finished", label: "When crew finishes job" },
  { value: "invoice_sent", label: "When invoice is sent" },
  { value: "invoice_unpaid_3_days", label: "When invoice is unpaid for 3 days" },
  { value: "safety_incident", label: "When safety incident is logged" },
  { value: "customer_message", label: "When customer portal message arrives" },
  { value: "ticket_submitted", label: "When service ticket is submitted" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Send Email" },
  { value: "send_sms", label: "Send SMS" },
  { value: "add_activity_note", label: "Add Activity Note" },
  { value: "assign_user", label: "Assign User" },
  { value: "assign_crew", label: "Assign Crew" },
  { value: "create_task", label: "Create Task" },
  { value: "move_pipeline_stage", label: "Move Pipeline Stage" },
  { value: "change_status", label: "Change Status" },
  { value: "notify_customer_portal", label: "Notify Customer Portal" },
  { value: "apply_tags", label: "Apply Tags" },
];

export function AutomationBuilder({
  automation,
  onSave,
  onCancel,
}: {
  automation?: Automation;
  onSave: (automation: Automation) => Promise<void>;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Automation>({
    name: automation?.name || "",
    description: automation?.description || "",
    trigger_type: automation?.trigger_type || "event",
    trigger_value: automation?.trigger_value || "",
    conditions: automation?.conditions || {},
    actions: automation?.actions || [],
    active: automation?.active ?? true,
  });

  const [saving, setSaving] = useState(false);

  const addAction = () => {
    setFormData({
      ...formData,
      actions: [
        ...formData.actions,
        {
          action_type: "send_email",
          action_payload: {},
          sort_order: formData.actions.length,
        },
      ],
    });
  };

  const removeAction = (index: number) => {
    setFormData({
      ...formData,
      actions: formData.actions.filter((_, i) => i !== index),
    });
  };

  const updateAction = (index: number, updates: Partial<AutomationAction>) => {
    const newActions = [...formData.actions];
    newActions[index] = { ...newActions[index], ...updates };
    setFormData({ ...formData, actions: newActions });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Automation Name</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Instant Follow-Up When Proposal Viewed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description (optional)</label>
          <Input
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="What does this automation do?"
          />
        </div>
      </div>

      {/* Step 1: Choose Trigger */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Step 1: Choose Trigger</h3>
        <div>
          <label className="block text-sm font-medium mb-1">When should this automation run?</label>
          <select
            className="w-full px-3 py-2 border rounded-md bg-background"
            value={formData.trigger_value}
            onChange={(e) => setFormData({ ...formData, trigger_value: e.target.value })}
          >
            <option value="">Select a trigger...</option>
            {TRIGGER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 2: Conditions (optional) */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Step 2: Add Conditions (optional)</h3>
        <p className="text-sm text-muted-foreground">
          Add filters to only run this automation when certain conditions are met.
        </p>
        <div className="border rounded-md p-4 bg-muted/40">
          <p className="text-sm text-muted-foreground">
            Conditions editor is not available in v1. Automations run for all matching triggers.
          </p>
        </div>
      </div>

      {/* Step 3: Actions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Step 3: Add Actions</h3>
          <Button onClick={addAction} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add Action
          </Button>
        </div>

        {formData.actions.length === 0 ? (
          <div className="border border-dashed rounded-md p-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              No actions yet. Add your first action to get started.
            </p>
            <Button onClick={addAction} variant="outline">
              Add First Action
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {formData.actions.map((action, index) => (
              <div key={index} className="border rounded-md p-4 bg-muted/20">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Action {index + 1}
                    </span>
                  </div>
                  <Button
                    onClick={() => removeAction(index)}
                    variant="ghost"
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Action Type</label>
                    <select
                      className="w-full px-3 py-2 border rounded-md bg-background"
                      value={action.action_type}
                      onChange={(e) =>
                        updateAction(index, { action_type: e.target.value, action_payload: {} })
                      }
                    >
                      {ACTION_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action-specific fields */}
                  {action.action_type === "send_email" && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">To (email or variable)</label>
                        <Input
                          value={action.action_payload.to || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, to: e.target.value },
                            })
                          }
                          placeholder="homeowner_email or specific@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Subject</label>
                        <Input
                          value={action.action_payload.subject || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, subject: e.target.value },
                            })
                          }
                          placeholder="Email subject"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Body</label>
                        <textarea
                          className="w-full px-3 py-2 border rounded-md bg-background min-h-[100px]"
                          value={action.action_payload.body || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, body: e.target.value },
                            })
                          }
                          placeholder="Email body (HTML supported)"
                        />
                      </div>
                    </div>
                  )}

                  {action.action_type === "send_sms" && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">To (phone or variable)</label>
                        <Input
                          value={action.action_payload.to || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, to: e.target.value },
                            })
                          }
                          placeholder="homeowner_phone or +1234567890"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Message</label>
                        <textarea
                          className="w-full px-3 py-2 border rounded-md bg-background"
                          value={action.action_payload.message || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, message: e.target.value },
                            })
                          }
                          placeholder="SMS message"
                        />
                      </div>
                    </div>
                  )}

                  {action.action_type === "assign_user" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">User ID</label>
                      <Input
                        value={action.action_payload.user_id || ""}
                        onChange={(e) =>
                          updateAction(index, {
                            action_payload: { ...action.action_payload, user_id: e.target.value },
                          })
                        }
                        placeholder="User ID to assign"
                      />
                    </div>
                  )}

                  {action.action_type === "create_task" && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">Task Title</label>
                        <Input
                          value={action.action_payload.title || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, title: e.target.value },
                            })
                          }
                          placeholder="Task title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea
                          className="w-full px-3 py-2 border rounded-md bg-background"
                          value={action.action_payload.description || ""}
                          onChange={(e) =>
                            updateAction(index, {
                              action_payload: { ...action.action_payload, description: e.target.value },
                            })
                          }
                          placeholder="Task description"
                        />
                      </div>
                    </div>
                  )}

                  {/* Add more action-specific fields as needed */}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 4: Review */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Step 4: Review</h3>
        <div className="border rounded-md p-4 bg-muted/20">
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">WHEN</span> {formData.trigger_value || "..."}
            </p>
            <p className="text-sm">
              <span className="font-medium">THEN</span>{" "}
              {formData.actions.length > 0
                ? formData.actions.map((a, i) => ACTION_TYPES.find((t) => t.value === a.action_type)?.label || a.action_type).join(" → ")
                : "No actions"}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button onClick={onCancel} variant="outline">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || !formData.name || !formData.trigger_value || formData.actions.length === 0}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : automation?.id ? "Update Automation" : "Create Automation"}
        </Button>
      </div>
    </div>
  );
}

























