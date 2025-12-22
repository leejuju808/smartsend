// Block 232000 — Automation Management Page

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AutomationBuilder } from "@/components/automation/AutomationBuilder";
import { Plus, Play, Pause, Edit, Trash2, Eye } from "lucide-react";

interface Automation {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_value: string;
  conditions: any;
  active: boolean;
  automation_actions: Array<{
    id: string;
    action_type: string;
    action_payload: any;
    sort_order: number;
  }>;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAutomations();
  }, []);

  const loadAutomations = async () => {
    try {
      const res = await fetch("/api/automations/list");
      const data = await res.json();
      setAutomations(data.automations || []);
    } catch (error) {
      console.error("Error loading automations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (automation: any) => {
    setSaving(true);
    try {
      if (automation.id) {
        // Update
        const res = await fetch("/api/automations/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: automation.id,
            name: automation.name,
            description: automation.description,
            trigger_type: automation.trigger_type,
            trigger_value: automation.trigger_value,
            conditions: automation.conditions,
            actions: automation.actions,
            active: automation.active,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to update automation");
        }
      } else {
        // Create
        const res = await fetch("/api/automations/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: automation.name,
            description: automation.description,
            trigger_type: automation.trigger_type,
            trigger_value: automation.trigger_value,
            conditions: automation.conditions,
            actions: automation.actions,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to create automation");
        }
      }

      await loadAutomations();
      setShowBuilder(false);
      setEditingAutomation(undefined);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch("/api/automations/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        throw new Error("Failed to toggle automation");
      }

      await loadAutomations();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleEdit = (automation: Automation) => {
    setEditingAutomation({
      ...automation,
      actions: automation.automation_actions || [],
    });
    setShowBuilder(true);
  };

  const handleCancel = () => {
    setShowBuilder(false);
    setEditingAutomation(undefined);
  };

  if (showBuilder) {
    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">
            {editingAutomation ? "Edit Automation" : "Create New Automation"}
          </h1>
          <p className="text-muted-foreground">
            Build powerful automations that connect every part of SmartSend together.
          </p>
        </div>
        <AutomationBuilder
          automation={editingAutomation}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Automations</h1>
          <p className="text-muted-foreground">
            Create IF → THEN rules that make SmartSend run itself.
          </p>
        </div>
        <Button onClick={() => setShowBuilder(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Automation
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading automations...</p>
        </div>
      ) : automations.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first automation to make SmartSend work for you automatically.
          </p>
          <Button onClick={() => setShowBuilder(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create First Automation
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="border rounded-lg p-6 bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{automation.name}</h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        automation.active
                          ? "bg-green-500/20 text-green-500"
                          : "bg-gray-500/20 text-gray-500"
                      }`}
                    >
                      {automation.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {automation.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {automation.description}
                    </p>
                  )}
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-medium">WHEN:</span> {automation.trigger_value}
                    </p>
                    <p>
                      <span className="font-medium">THEN:</span>{" "}
                      {automation.automation_actions
                        ?.map((a) => {
                          const actionNames: Record<string, string> = {
                            send_email: "Send Email",
                            send_sms: "Send SMS",
                            assign_user: "Assign User",
                            create_task: "Create Task",
                            move_pipeline_stage: "Move Pipeline Stage",
                            change_status: "Change Status",
                            notify_customer_portal: "Notify Customer Portal",
                            apply_tags: "Apply Tags",
                          };
                          return actionNames[a.action_type] || a.action_type;
                        })
                        .join(" → ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleToggle(automation.id, automation.active)}
                    variant="outline"
                    size="sm"
                  >
                    {automation.active ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    onClick={() => handleEdit(automation)}
                    variant="outline"
                    size="sm"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

























