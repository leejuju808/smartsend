"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Plus, Save } from "lucide-react";

type RoutingRule = {
  id: string;
  name: string | null;
  workspace_id: string;
  segment_id: string | null;
  min_score: number | null;
  max_score: number | null;
  require_enriched: boolean;
  exclude_bounced: boolean;
  target_campaign_id: string;
  auto_start: boolean;
  conflict_mode: "first_match" | "exclusive" | "allow_multi";
  rule_order: number;
  is_active: boolean;
  created_at: string;
};

type Campaign = {
  id: string;
  name: string | null;
  title: string | null;
};

type Segment = {
  id: string;
  name: string;
};

export default function LeadRoutingPage() {
  const supabase = createClientComponentClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    segment_id: "",
    min_score: "",
    max_score: "",
    require_enriched: false,
    exclude_bounced: true,
    target_campaign_id: "",
    auto_start: true,
    conflict_mode: "first_match" as "first_match" | "exclusive" | "allow_multi",
    rule_order: 0,
    is_active: true,
  });

  // Load workspace, rules, campaigns, and segments
  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get workspace_id
        const { data: wsMember } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!wsMember?.workspace_id) {
          toast.error("No workspace found");
          return;
        }

        setWorkspaceId(wsMember.workspace_id);

        // Load routing rules
        const { data: rulesData } = await supabase
          .from("lead_routing_rules")
          .select("*")
          .eq("workspace_id", wsMember.workspace_id)
          .order("rule_order", { ascending: true });

        if (rulesData) setRules(rulesData as RoutingRule[]);

        // Load campaigns
        const { data: campaignsData } = await supabase
          .from("campaigns")
          .select("id, name, title")
          .eq("workspace_id", wsMember.workspace_id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (campaignsData) {
          setCampaigns(
            campaignsData.map((c) => ({
              id: c.id,
              name: c.name || c.title || "Untitled Campaign",
            })) as Campaign[]
          );
        }

        // Load segments
        const { data: segmentsData } = await supabase
          .from("segments")
          .select("id, name")
          .eq("account_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (segmentsData) setSegments(segmentsData as Segment[]);
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase]);

  const handleSave = async () => {
    if (!workspaceId) {
      toast.error("No workspace found");
      return;
    }

    if (!formData.target_campaign_id) {
      toast.error("Please select a target campaign");
      return;
    }

    setSaving(true);
    try {
      const ruleData = {
        workspace_id: workspaceId,
        name: formData.name || null,
        segment_id: formData.segment_id || null,
        min_score: formData.min_score ? parseInt(formData.min_score) : null,
        max_score: formData.max_score ? parseInt(formData.max_score) : null,
        require_enriched: formData.require_enriched,
        exclude_bounced: formData.exclude_bounced,
        target_campaign_id: formData.target_campaign_id,
        auto_start: formData.auto_start,
        conflict_mode: formData.conflict_mode,
        rule_order: formData.rule_order,
        is_active: formData.is_active,
      };

      const { error } = await supabase
        .from("lead_routing_rules")
        .insert(ruleData);

      if (error) throw error;

      toast.success("Routing rule created");
      
      // Reset form
      setFormData({
        name: "",
        segment_id: "",
        min_score: "",
        max_score: "",
        require_enriched: false,
        exclude_bounced: true,
        target_campaign_id: "",
        auto_start: true,
        conflict_mode: "first_match",
        rule_order: rules.length,
        is_active: true,
      });

      // Reload rules
      const { data: rulesData } = await supabase
        .from("lead_routing_rules")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("rule_order", { ascending: true });

      if (rulesData) setRules(rulesData as RoutingRule[]);
    } catch (error: any) {
      console.error("Error saving rule:", error);
      toast.error(error.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this routing rule?")) return;

    try {
      const { error } = await supabase
        .from("lead_routing_rules")
        .delete()
        .eq("id", ruleId);

      if (error) throw error;

      toast.success("Rule deleted");
      setRules(rules.filter((r) => r.id !== ruleId));
    } catch (error: any) {
      console.error("Error deleting rule:", error);
      toast.error(error.message || "Failed to delete rule");
    }
  };

  const handleToggleActive = async (ruleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("lead_routing_rules")
        .update({ is_active: !isActive })
        .eq("id", ruleId);

      if (error) throw error;

      setRules(
        rules.map((r) => (r.id === ruleId ? { ...r, is_active: !isActive } : r))
      );
    } catch (error: any) {
      console.error("Error toggling rule:", error);
      toast.error(error.message || "Failed to update rule");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Lead Routing v1 ⚡</h1>
        <p className="text-muted-foreground mt-2">
          Automatically assign leads into campaigns based on segments, score, enrichment, ICP, and engagement
        </p>
      </div>

      {/* Rule Builder */}
      <Card>
        <CardHeader>
          <CardTitle>Create Routing Rule</CardTitle>
          <CardDescription>
            Define conditions that automatically route leads to campaigns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name (optional)</Label>
              <Input
                id="name"
                placeholder="e.g., High-Score ICP"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_campaign">Target Campaign *</Label>
              <Select
                value={formData.target_campaign_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, target_campaign_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Conditions</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="segment">Segment</Label>
                <Select
                  value={formData.segment_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, segment_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any segment (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any segment</SelectItem>
                    {segments.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id}>
                        {segment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="min_score">Min Score</Label>
                  <Input
                    id="min_score"
                    type="number"
                    placeholder="0"
                    value={formData.min_score}
                    onChange={(e) =>
                      setFormData({ ...formData, min_score: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_score">Max Score</Label>
                  <Input
                    id="max_score"
                    type="number"
                    placeholder="100"
                    value={formData.max_score}
                    onChange={(e) =>
                      setFormData({ ...formData, max_score: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="require_enriched">Require Enriched</Label>
                  <p className="text-sm text-muted-foreground">
                    Only route leads that have been enriched
                  </p>
                </div>
                <Switch
                  id="require_enriched"
                  checked={formData.require_enriched}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, require_enriched: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="exclude_bounced">Exclude Bounced Leads</Label>
                  <p className="text-sm text-muted-foreground">
                    Skip leads that have bounced
                  </p>
                </div>
                <Switch
                  id="exclude_bounced"
                  checked={formData.exclude_bounced}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, exclude_bounced: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Actions</h3>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto_start">Auto-Start Sequence</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically start the first step when lead is routed
                </p>
              </div>
              <Switch
                id="auto_start"
                checked={formData.auto_start}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, auto_start: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conflict_mode">Conflict Prevention</Label>
              <Select
                value={formData.conflict_mode}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, conflict_mode: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_match">
                    First-Match Wins (order rules manually)
                  </SelectItem>
                  <SelectItem value="exclusive">
                    Exclusive Rule (only this rule can fire)
                  </SelectItem>
                  <SelectItem value="allow_multi">
                    Allow Multi-Campaign Routing
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Create Rule"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Routing Rules</CardTitle>
          <CardDescription>
            {rules.length} active routing rule{rules.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No routing rules created yet.</p>
              <p className="text-sm">Create your first rule above!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const campaign = campaigns.find((c) => c.id === rule.target_campaign_id);
                const segment = segments.find((s) => s.id === rule.segment_id);

                return (
                  <div
                    key={rule.id}
                    className={`border rounded-lg p-4 space-y-2 ${
                      !rule.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">
                            {rule.name || `Rule #${rule.rule_order + 1}`}
                          </h4>
                          {!rule.is_active && (
                            <span className="text-xs text-muted-foreground">(Inactive)</span>
                          )}
                        </div>

                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <div className="flex flex-wrap gap-4">
                            {segment && (
                              <span>
                                <strong>Segment:</strong> {segment.name}
                              </span>
                            )}
                            {rule.min_score !== null && (
                              <span>
                                <strong>Min Score:</strong> {rule.min_score}
                              </span>
                            )}
                            {rule.max_score !== null && (
                              <span>
                                <strong>Max Score:</strong> {rule.max_score}
                              </span>
                            )}
                            {rule.require_enriched && (
                              <span className="text-blue-600">Requires Enriched</span>
                            )}
                            {rule.exclude_bounced && (
                              <span className="text-orange-600">Excludes Bounced</span>
                            )}
                          </div>
                          <div>
                            <strong>→ Route to:</strong> {campaign?.name || "Unknown Campaign"}
                          </div>
                          <div className="text-xs">
                            <strong>Mode:</strong> {rule.conflict_mode.replace("_", " ")} •{" "}
                            <strong>Auto-start:</strong> {rule.auto_start ? "Yes" : "No"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={() =>
                            handleToggleActive(rule.id, rule.is_active)
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



