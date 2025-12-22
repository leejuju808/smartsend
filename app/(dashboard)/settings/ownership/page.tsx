"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OwnershipSettingsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [leadRule, setLeadRule] = useState<any>(null);
  const [dealRule, setDealRule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Get workspace ID
    const cookieWs = document.cookie
      .split("; ")
      .find((row) => row.startsWith("ws="))
      ?.split("=")[1];
    if (cookieWs) {
      setWorkspaceId(cookieWs);
      loadData(cookieWs);
    }
  }, []);

  const loadData = async (wsId: string) => {
    setLoading(true);
    try {
      // Load members
      const membersRes = await fetch(`/api/workspaces/${wsId}/members-list`);
      const membersData = await membersRes.json();
      if (membersData.members) {
        setMembers(membersData.members);
      }

      // Load assignment rules
      const rulesRes = await fetch("/api/assignment-rules");
      const rulesData = await rulesRes.json();
      if (rulesData.rules) {
        const leadRuleData = rulesData.rules.find((r: any) => r.target === "leads" && r.is_active);
        const dealRuleData = rulesData.rules.find((r: any) => r.target === "deals" && r.is_active);
        setLeadRule(leadRuleData || { type: "none", config: {} });
        setDealRule(dealRuleData || { type: "from_lead_owner", config: {} });
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast({
        title: "Error",
        description: "Failed to load ownership settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLeadRule = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/assignment-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: leadRule.type,
          target: "leads",
          config: leadRule.config,
          is_active: leadRule.type !== "none",
        }),
      });

      if (!response.ok) throw new Error("Failed to save");
      toast({
        title: "Success",
        description: "Lead assignment rule saved",
      });
      if (workspaceId) loadData(workspaceId);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save lead assignment rule",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDealRule = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/assignment-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: dealRule.type,
          target: "deals",
          config: dealRule.config,
          is_active: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to save");
      toast({
        title: "Success",
        description: "Deal assignment rule saved",
      });
      if (workspaceId) loadData(workspaceId);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save deal assignment rule",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Ownership Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how leads and deals are automatically assigned
        </p>
      </div>

      {/* Lead Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Assignment</CardTitle>
          <CardDescription>Configure how new leads are assigned to team members</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={leadRule?.type || "none"}
            onValueChange={(value) => setLeadRule({ ...leadRule, type: value, config: {} })}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="round_robin" id="lead-round-robin" />
              <Label htmlFor="lead-round-robin">Round Robin</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="single_owner" id="lead-single-owner" />
              <Label htmlFor="lead-single-owner">Single Owner</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="none" id="lead-none" />
              <Label htmlFor="lead-none">None (No Auto-Assignment)</Label>
            </div>
          </RadioGroup>

          {leadRule?.type === "round_robin" && (
            <div className="space-y-2 pl-6">
              <Label>Team Members</Label>
              {members.map((member) => (
                <div key={member.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={leadRule.config?.members?.some((m: any) => m.user_id === member.id) || false}
                    onChange={(e) => {
                      const members = leadRule.config?.members || [];
                      if (e.target.checked) {
                        setLeadRule({
                          ...leadRule,
                          config: {
                            ...leadRule.config,
                            members: [...members, { user_id: member.id, weight: 1 }],
                          },
                        });
                      } else {
                        setLeadRule({
                          ...leadRule,
                          config: {
                            ...leadRule.config,
                            members: members.filter((m: any) => m.user_id !== member.id),
                          },
                        });
                      }
                    }}
                  />
                  <Label>{member.name}</Label>
                  {leadRule.config?.members?.some((m: any) => m.user_id === member.id) && (
                    <Input
                      type="number"
                      min="1"
                      className="w-20"
                      value={
                        leadRule.config.members.find((m: any) => m.user_id === member.id)?.weight || 1
                      }
                      onChange={(e) => {
                        const weight = parseInt(e.target.value) || 1;
                        const members = leadRule.config.members.map((m: any) =>
                          m.user_id === member.id ? { ...m, weight } : m
                        );
                        setLeadRule({
                          ...leadRule,
                          config: { ...leadRule.config, members },
                        });
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {leadRule?.type === "single_owner" && (
            <div className="pl-6">
              <Label>Owner</Label>
              <Select
                value={leadRule.config?.user_id || ""}
                onValueChange={(value) =>
                  setLeadRule({
                    ...leadRule,
                    config: { user_id: value },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleSaveLeadRule} disabled={saving}>
            {saving ? "Saving..." : "Save Lead Assignment"}
          </Button>
        </CardContent>
      </Card>

      {/* Deal Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Deal Assignment</CardTitle>
          <CardDescription>Configure how new deals are assigned</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={dealRule?.type || "from_lead_owner"}
            onValueChange={(value) => setDealRule({ ...dealRule, type: value, config: {} })}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="from_lead_owner" id="deal-lead-owner" />
              <Label htmlFor="deal-lead-owner">From Lead Owner</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="round_robin" id="deal-round-robin" />
              <Label htmlFor="deal-round-robin">Round Robin</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="single_owner" id="deal-single-owner" />
              <Label htmlFor="deal-single-owner">Single Owner</Label>
            </div>
          </RadioGroup>

          {dealRule?.type === "round_robin" && (
            <div className="space-y-2 pl-6">
              <Label>Team Members</Label>
              {members.map((member) => (
                <div key={member.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={dealRule.config?.members?.some((m: any) => m.user_id === member.id) || false}
                    onChange={(e) => {
                      const members = dealRule.config?.members || [];
                      if (e.target.checked) {
                        setDealRule({
                          ...dealRule,
                          config: {
                            ...dealRule.config,
                            members: [...members, { user_id: member.id, weight: 1 }],
                          },
                        });
                      } else {
                        setDealRule({
                          ...dealRule,
                          config: {
                            ...dealRule.config,
                            members: members.filter((m: any) => m.user_id !== member.id),
                          },
                        });
                      }
                    }}
                  />
                  <Label>{member.name}</Label>
                </div>
              ))}
            </div>
          )}

          {dealRule?.type === "single_owner" && (
            <div className="pl-6">
              <Label>Owner</Label>
              <Select
                value={dealRule.config?.user_id || ""}
                onValueChange={(value) =>
                  setDealRule({
                    ...dealRule,
                    config: { user_id: value },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleSaveDealRule} disabled={saving}>
            {saving ? "Saving..." : "Save Deal Assignment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}








