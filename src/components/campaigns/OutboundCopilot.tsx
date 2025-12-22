"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react";

interface OutboundCopilotProps {
  campaignId: string;
}

interface CopilotAction {
  id: string;
  action_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

interface Activity {
  id: string;
  activity_type: string;
  message: string;
  created_at: string;
}

interface Recommendation {
  id: string;
  recommendation_type: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  status: "pending" | "applied" | "dismissed" | "ignored";
}

export function OutboundCopilot({ campaignId }: OutboundCopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [recentActions, setRecentActions] = useState<CopilotAction[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [showCreateSequenceModal, setShowCreateSequenceModal] = useState(false);
  const [createSequenceConfig, setCreateSequenceConfig] = useState({
    icp_industry: "",
    icp_role: "",
    icp_company_size: "",
    sequence_length: 5,
    channels: ["email"] as string[],
    tone: "professional" as "direct" | "friendly" | "casual" | "professional",
    aggression: "balanced" as "soft" | "balanced" | "pushy",
  });

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, campaignId]);

  async function loadData() {
    try {
      // Load recent actions
      const actionsRes = await fetch(`/api/campaigns/${campaignId}/copilot`);
      if (actionsRes.ok) {
        const actionsData = await actionsRes.json();
        setRecentActions(actionsData.actions || []);
      }

      // Load activities
      const activitiesRes = await fetch(`/api/campaigns/${campaignId}/copilot/activity?limit=10`);
      if (activitiesRes.ok) {
        const activitiesData = await activitiesRes.json();
        setActivities(activitiesData.activities || []);
      }

      // Load recommendations
      const recsRes = await fetch(`/api/campaigns/${campaignId}/copilot/recommendations?status=pending`);
      if (recsRes.ok) {
        const recsData = await recsRes.json();
        setRecommendations(recsData.recommendations || []);
      }
    } catch (error) {
      console.error("Failed to load copilot data:", error);
    }
  }

  async function handleAction(actionType: string, inputConfig?: any) {
    setLoading(true);
    setCurrentAction(actionType);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: actionType,
          input_config: inputConfig || {},
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Action failed");
      }

      const result = await response.json();
      
      // Reload data
      await loadData();
      
      // Close modals
      setShowCreateSequenceModal(false);
      
      // Show success message
      alert(`✅ ${getActionLabel(actionType)} completed successfully!`);
    } catch (error: any) {
      alert(`❌ Failed: ${error.message}`);
    } finally {
      setLoading(false);
      setCurrentAction(null);
    }
  }

  function getActionLabel(actionType: string): string {
    const labels: Record<string, string> = {
      create_sequence: "Sequence Created",
      rewrite_sequence: "Sequence Rewritten",
      fix_underperforming_steps: "Underperforming Steps Fixed",
      shorten_steps: "Steps Shortened",
      expand_multichannel: "Multi-Channel Expanded",
      inject_personalization: "Personalization Injected",
      rewrite_for_icp: "Rewritten for ICP",
      optimize_subject_lines: "Subject Lines Optimized",
      fix_deliverability: "Deliverability Fixed",
      add_high_intent_step: "High-Intent Step Added",
      auto_optimize_all: "Auto-Optimization Complete",
    };
    return labels[actionType] || actionType;
  }

  function getActionIcon(actionType: string) {
    switch (actionType) {
      case "create_sequence":
        return "✨";
      case "rewrite_sequence":
        return "✏️";
      case "fix_underperforming_steps":
        return "🔧";
      case "shorten_steps":
        return "✂️";
      case "expand_multichannel":
        return "📱";
      case "inject_personalization":
        return "🎯";
      case "rewrite_for_icp":
        return "👥";
      case "optimize_subject_lines":
        return "📧";
      case "fix_deliverability":
        return "🛡️";
      case "add_high_intent_step":
        return "🔥";
      case "auto_optimize_all":
        return "⚡";
      default:
        return "🤖";
    }
  }

  return (
    <>
      {/* Copilot Button */}
      <Button
        onClick={() => setIsOpen(true)}
        variant="default"
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        Outbound Copilot
      </Button>

      {/* Copilot Panel Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-yellow-500" />
                    Outbound Copilot v1
                  </CardTitle>
                  <CardDescription>
                    AI SDR that drafts, optimizes, and repairs entire outreach systems automatically
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  ×
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Recommendations</h3>
                  {recommendations.slice(0, 3).map((rec) => (
                    <div
                      key={rec.id}
                      className={`p-3 rounded-lg border ${
                        rec.priority === "critical"
                          ? "bg-red-50 border-red-200"
                          : rec.priority === "high"
                          ? "bg-orange-50 border-orange-200"
                          : "bg-blue-50 border-blue-200"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{rec.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {rec.description}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleAction("auto_optimize_all", {
                              recommendation_id: rec.id,
                            })
                          }
                          disabled={loading}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  icon="✨"
                  label="Create Sequence From Scratch"
                  description="Auto-generate multi-step sequence"
                  onClick={() => setShowCreateSequenceModal(true)}
                  disabled={loading}
                />
                <ActionButton
                  icon="✏️"
                  label="Rewrite Entire Sequence"
                  description="Improve clarity, remove spam words"
                  onClick={() => handleAction("rewrite_sequence")}
                  disabled={loading}
                  loading={currentAction === "rewrite_sequence"}
                />
                <ActionButton
                  icon="🔧"
                  label="Fix Underperforming Steps"
                  description="Rewrite low-performing steps"
                  onClick={() => handleAction("fix_underperforming_steps")}
                  disabled={loading}
                  loading={currentAction === "fix_underperforming_steps"}
                />
                <ActionButton
                  icon="✂️"
                  label="Shorten All Steps"
                  description="Reduce to 70-120 words"
                  onClick={() => handleAction("shorten_steps")}
                  disabled={loading}
                  loading={currentAction === "shorten_steps"}
                />
                <ActionButton
                  icon="📱"
                  label="Expand With Multi-Channel"
                  description="Add SMS, LinkedIn, call tasks"
                  onClick={() => handleAction("expand_multichannel", { channels: ["sms", "linkedin"] })}
                  disabled={loading}
                  loading={currentAction === "expand_multichannel"}
                />
                <ActionButton
                  icon="🎯"
                  label="Inject Personalization"
                  description="Add smart placeholders"
                  onClick={() => handleAction("inject_personalization")}
                  disabled={loading}
                  loading={currentAction === "inject_personalization"}
                />
                <ActionButton
                  icon="👥"
                  label="Rewrite for Specific ICP"
                  description="Tailor messaging to ICP"
                  onClick={() => handleAction("rewrite_for_icp", { icp_industry: "", icp_role: "" })}
                  disabled={loading}
                  loading={currentAction === "rewrite_for_icp"}
                />
                <ActionButton
                  icon="📧"
                  label="Optimize Subject Lines"
                  description="Generate 10 alternatives"
                  onClick={() => handleAction("optimize_subject_lines")}
                  disabled={loading}
                  loading={currentAction === "optimize_subject_lines"}
                />
                <ActionButton
                  icon="🛡️"
                  label="Fix Deliverability Risks"
                  description="Remove spam words, fix issues"
                  onClick={() => handleAction("fix_deliverability")}
                  disabled={loading}
                  loading={currentAction === "fix_deliverability"}
                />
                <ActionButton
                  icon="🔥"
                  label="Add High-Intent Step"
                  description="For A-priority leads"
                  onClick={() => handleAction("add_high_intent_step", { intent_type: "interested" })}
                  disabled={loading}
                  loading={currentAction === "add_high_intent_step"}
                />
              </div>

              {/* Big Auto-Optimize Button */}
              <div className="pt-4 border-t">
                <Button
                  onClick={() => handleAction("auto_optimize_all")}
                  disabled={loading}
                  className="w-full gap-2"
                  size="lg"
                >
                  {loading && currentAction === "auto_optimize_all" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  Autopilot Mode: Optimize All
                </Button>
              </div>

              {/* Activity Log */}
              {activities.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  <h3 className="font-semibold text-sm">Recent Activity</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="text-xs text-muted-foreground flex items-center gap-2"
                      >
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        {activity.message}
                        <span className="text-xs opacity-50">
                          {new Date(activity.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Sequence Modal */}
      {showCreateSequenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create Sequence From Scratch</CardTitle>
              <CardDescription>
                Configure your ICP and sequence parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">ICP Industry</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="e.g., Construction, SaaS, Healthcare"
                  value={createSequenceConfig.icp_industry}
                  onChange={(e) =>
                    setCreateSequenceConfig({
                      ...createSequenceConfig,
                      icp_industry: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">ICP Role</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="e.g., CEO, CTO, Marketing Director"
                  value={createSequenceConfig.icp_role}
                  onChange={(e) =>
                    setCreateSequenceConfig({
                      ...createSequenceConfig,
                      icp_role: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Company Size</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={createSequenceConfig.icp_company_size}
                  onChange={(e) =>
                    setCreateSequenceConfig({
                      ...createSequenceConfig,
                      icp_company_size: e.target.value,
                    })
                  }
                >
                  <option value="">Select...</option>
                  <option value="startup">Startup (1-10)</option>
                  <option value="small">Small (11-50)</option>
                  <option value="mid">Mid-size (51-200)</option>
                  <option value="enterprise">Enterprise (200+)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Sequence Length</label>
                <input
                  type="number"
                  min="3"
                  max="8"
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={createSequenceConfig.sequence_length}
                  onChange={(e) =>
                    setCreateSequenceConfig({
                      ...createSequenceConfig,
                      sequence_length: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Tone</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  value={createSequenceConfig.tone}
                  onChange={(e) =>
                    setCreateSequenceConfig({
                      ...createSequenceConfig,
                      tone: e.target.value as any,
                    })
                  }
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="casual">Casual</option>
                  <option value="direct">Direct</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCreateSequenceModal(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    handleAction("create_sequence", createSequenceConfig)
                  }
                  disabled={loading}
                  className="flex-1"
                >
                  {loading && currentAction === "create_sequence" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create Sequence"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function ActionButton({
  icon,
  label,
  description,
  onClick,
  disabled,
  loading,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="p-4 text-left border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
    </button>
  );
}



