"use client";

// Block 23000 — SmartSend Roofing Automation Engine v1
// Automation Rules Page (Owner View)

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  AlertTriangle,
  DollarSign,
  Package,
  Users,
  TrendingDown,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import { createClientComponentClient } from "@/lib/supabase";

interface Automation {
  id: string;
  name: string;
  trigger_event: string;
  condition: any;
  actions: any[];
  is_active: boolean;
  created_at: string;
}

interface AutomationLog {
  id: string;
  automation_id: string;
  automation?: { name: string };
  trigger_event: string;
  target_type: string;
  target_id: string;
  status: "success" | "error";
  message: string;
  created_at: string;
}

// Pre-built automation templates
const RECOMMENDED_AUTOMATIONS = [
  {
    name: "Invoice Overdue Reminder",
    trigger_event: "invoice_status_changed",
    condition: { field: "invoice.status", equals: "sent", age_days_gt: 3 },
    actions: [
      { type: "send_email", template: "invoice_overdue_reminder" },
      { type: "create_production_alert", severity: "warning", message: "Invoice overdue 3+ days" },
    ],
    description: "Send payment reminder email + show alert when invoice is unpaid for 3 days",
  },
  {
    name: "Job Completed → Send Review Request",
    trigger_event: "job_status_changed",
    condition: { field: "job.status", equals: "completed" },
    actions: [
      { type: "send_email", template: "review_request" },
      { type: "update_job_flag" },
    ],
    description: "Send review request email when job is completed",
  },
  {
    name: "Material Delayed → Alert Owner",
    trigger_event: "material_order_status_changed",
    condition: { field: "material_order.status", equals: "delayed" },
    actions: [
      { type: "create_production_alert", severity: "critical", message: "Material delay — check schedule for this job" },
    ],
    description: "Alert owner when material order is delayed",
  },
  {
    name: "Margin Risk from AI → Owner Alert",
    trigger_event: "ai_insight_created",
    condition: { field: "ai_insights.category", equals: "margin_risk", field2: "ai_insights.severity", equals: "critical" },
    actions: [
      { type: "create_production_alert", severity: "critical" },
      { type: "update_job_flag" },
    ],
    description: "Alert owner when AI detects margin risk",
  },
  {
    name: "Crew Check-In → Homeowner Notification",
    trigger_event: "field_session_checked_in",
    condition: null,
    actions: [
      { type: "send_email", template: "crew_arrived" },
    ],
    description: "Send 'We're on the way' message to homeowner when crew checks in",
  },
];

export default function AutomationsSettingsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"recommended" | "active" | "logs">("recommended");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get workspace_id from user's workspace memberships
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) return;
      setWorkspaceId(membership.workspace_id);

      // Load automations
      const { data: autoData } = await supabase
        .from("automations")
        .select("*")
        .eq("workspace_id", membership.workspace_id)
        .order("created_at", { ascending: false });

      if (autoData) setAutomations(autoData);

      // Load recent logs
      const { data: logsData } = await supabase
        .from("automation_logs")
        .select(
          `
          *,
          automation:automations(name)
        `
        )
        .eq("workspace_id", membership.workspace_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (logsData) setLogs(logsData);
    } catch (error) {
      console.error("Error loading automations:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutomation = async (automationId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("automations")
        .update({ is_active: !currentStatus })
        .eq("id", automationId);

      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error("Error toggling automation:", error);
      alert("Failed to update automation");
    }
  };

  const createAutomation = async (template: typeof RECOMMENDED_AUTOMATIONS[0]) => {
    if (!workspaceId) return;

    try {
      const { error } = await supabase.from("automations").insert({
        workspace_id: workspaceId,
        name: template.name,
        trigger_event: template.trigger_event,
        condition: template.condition,
        actions: template.actions,
        is_active: true,
      });

      if (error) throw error;
      await loadData();
      setActiveTab("active");
    } catch (error) {
      console.error("Error creating automation:", error);
      alert("Failed to create automation");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading automations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/settings")}
              className="p-0 h-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
            </Button>
            <Zap className="h-5 w-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Automations</h1>
          </div>
          <p className="text-xs text-gray-500">
            Let SmartSend run your business automatically
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => setActiveTab("recommended")}
            className={`w-full text-left px-4 py-2 rounded-lg mb-2 flex items-center gap-2 ${
              activeTab === "recommended"
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            Recommended
          </button>
          <button
            onClick={() => setActiveTab("active")}
            className={`w-full text-left px-4 py-2 rounded-lg mb-2 flex items-center gap-2 ${
              activeTab === "active"
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Zap className="h-4 w-4" />
            Active ({automations.filter((a) => a.is_active).length})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`w-full text-left px-4 py-2 rounded-lg mb-2 flex items-center gap-2 ${
              activeTab === "logs"
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Clock className="h-4 w-4" />
            Logs ({logs.length})
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {activeTab === "recommended" && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Recommended Automations</h2>
              <p className="text-gray-600 mb-6">
                Pre-built automations that save you time and prevent chaos. Click to enable.
              </p>
              <div className="space-y-4">
                {RECOMMENDED_AUTOMATIONS.map((template, idx) => {
                  const isActive = automations.some(
                    (a) => a.name === template.name && a.is_active
                  );
                  return (
                    <div
                      key={idx}
                      className="bg-white border border-gray-200 rounded-lg p-6 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{template.name}</h3>
                            {isActive && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>Trigger: {template.trigger_event}</span>
                            <span>
                              Actions: {template.actions.map((a) => a.type).join(", ")}
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={() => createAutomation(template)}
                          disabled={isActive}
                          variant={isActive ? "outline" : "default"}
                          size="sm"
                        >
                          {isActive ? "Enabled" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "active" && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Active Automations</h2>
              {automations.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                  <Zap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No automations yet</p>
                  <Button onClick={() => setActiveTab("recommended")}>
                    Browse Recommended Automations
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {automations.map((automation) => (
                    <div
                      key={automation.id}
                      className="bg-white border border-gray-200 rounded-lg p-6"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{automation.name}</h3>
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                automation.is_active
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {automation.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Trigger: <code className="bg-gray-100 px-1 rounded">{automation.trigger_event}</code>
                          </p>
                          <p className="text-xs text-gray-500">
                            Actions: {automation.actions.map((a: any) => a.type).join(", ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAutomation(automation.id, automation.is_active)}
                            className="flex items-center gap-2"
                          >
                            {automation.is_active ? (
                              <ToggleRight className="h-6 w-6 text-green-600" />
                            ) : (
                              <ToggleLeft className="h-6 w-6 text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Automation Logs</h2>
              <p className="text-gray-600 mb-6">
                See what automations have fired recently and their results.
              </p>
              {logs.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No automation logs yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-4"
                    >
                      <div className="mt-1">
                        {log.status === "success" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {log.automation?.name || "Unknown Automation"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          Trigger: <code className="bg-gray-100 px-1 rounded">{log.trigger_event}</code>
                        </p>
                        {log.message && (
                          <p className="text-xs text-gray-500 mt-1">{log.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}







































