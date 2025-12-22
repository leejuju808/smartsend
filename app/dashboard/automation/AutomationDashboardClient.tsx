"use client";

// Block 75000 — Automation Dashboard Client Component

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Plus, Settings, Eye, Trash2, Play, Pause } from "lucide-react";
import { AutomationRuleBuilder } from "./AutomationRuleBuilder";
import { AutomationLogsView } from "./AutomationLogsView";
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
  created_at: string;
  updated_at: string;
}

export default function AutomationDashboardClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  useEffect(() => {
    fetchRules();
  }, [workspaceId]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/automation/rules");
      if (!response.ok) throw new Error("Failed to fetch rules");
      const data = await response.json();
      setRules(data.rules || []);
    } catch (error: any) {
      console.error("Error fetching rules:", error);
      toast.error("Failed to load automation rules");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      const response = await fetch("/api/automation/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error("Failed to create templates");
      
      toast.success("Pre-built templates created! Enable them to start using.");
      fetchRules();
    } catch (error: any) {
      console.error("Error creating templates:", error);
      toast.error("Failed to create templates");
    }
  };

  const handleToggleEnabled = async (ruleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/automation/rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });

      if (!response.ok) throw new Error("Failed to update rule");
      
      toast.success(`Rule ${!enabled ? "enabled" : "disabled"}`);
      fetchRules();
    } catch (error: any) {
      console.error("Error toggling rule:", error);
      toast.error("Failed to update rule");
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this automation rule?")) {
      return;
    }

    try {
      const response = await fetch(`/api/automation/rules/${ruleId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete rule");
      
      toast.success("Rule deleted");
      fetchRules();
    } catch (error: any) {
      console.error("Error deleting rule:", error);
      toast.error("Failed to delete rule");
    }
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setShowBuilder(true);
  };

  const handleCloseBuilder = () => {
    setShowBuilder(false);
    setEditingRule(null);
    fetchRules();
  };

  const getTriggerLabel = (triggerType: string) => {
    const labels: Record<string, string> = {
      lead_reply: "Lead Replies",
      new_lead: "New Lead Created",
      estimate_uploaded: "Estimate Uploaded",
      estimate_sent: "Estimate Sent",
      pipeline_stage_changed: "Pipeline Stage Changed",
      job_created: "Job Created",
      job_completed: "Job Completed",
      safety_flag: "Safety Flag Raised",
    };
    return labels[triggerType] || triggerType;
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      send_email: "Send Email",
      send_sms: "Send SMS",
      move_pipeline_stage: "Move Pipeline Stage",
      create_followup: "Create Follow-Up",
      assign_team_member: "Assign Team Member",
      create_job: "Create Job",
      send_owner_alert: "Send Owner Alert",
      update_job_status: "Update Job Status",
    };
    return labels[actionType] || actionType;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Loading automation rules...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowBuilder(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
          <Button variant="outline" onClick={handleCreateTemplate}>
            <Settings className="mr-2 h-4 w-4" />
            Load Pre-built Templates
          </Button>
        </div>
        <Button variant="outline" onClick={() => setShowLogs(!showLogs)}>
          <Eye className="mr-2 h-4 w-4" />
          {showLogs ? "Hide" : "View"} Logs
        </Button>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <h3 className="text-lg font-semibold mb-2">No automation rules yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first automation rule or load pre-built templates to get started.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setShowBuilder(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Rule
            </Button>
            <Button variant="outline" onClick={handleCreateTemplate}>
              Load Templates
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{rule.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        rule.enabled
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {rule.enabled ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {rule.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Trigger: </span>
                      <span className="font-medium">
                        {getTriggerLabel(rule.trigger_type)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Action: </span>
                      <span className="font-medium">
                        {getActionLabel(rule.action_type)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleEnabled(rule.id, rule.enabled)}
                    title={rule.enabled ? "Disable" : "Enable"}
                  >
                    {rule.enabled ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(rule)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(rule.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rule Builder Modal */}
      {showBuilder && (
        <AutomationRuleBuilder
          workspaceId={workspaceId}
          rule={editingRule}
          onClose={handleCloseBuilder}
        />
      )}

      {/* Logs View */}
      {showLogs && (
        <AutomationLogsView workspaceId={workspaceId} onClose={() => setShowLogs(false)} />
      )}
    </div>
  );
}



























