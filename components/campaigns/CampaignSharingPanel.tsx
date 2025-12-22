"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type TeamMember = {
  user_id: string;
  email: string;
  name?: string;
  role: string;
};

type CampaignSharingPanelProps = {
  campaignId: string;
  workspaceId: string;
  currentUserId: string;
  currentUserRole: string | null;
  initialOwnerId?: string | null;
  initialVisibility?: "workspace" | "restricted";
};

export function CampaignSharingPanel({
  campaignId,
  workspaceId,
  currentUserId,
  currentUserRole,
  initialOwnerId,
  initialVisibility = "workspace",
}: CampaignSharingPanelProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(initialOwnerId || null);
  const [visibility, setVisibility] = useState<"workspace" | "restricted">(
    initialVisibility
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const canEdit = currentUserRole && ["owner", "admin"].includes(currentUserRole);
  const isReadOnly = currentUserRole === "read_only" || currentUserRole === "viewer";

  useEffect(() => {
    loadTeamMembers();
  }, [workspaceId]);

  async function loadTeamMembers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/team-members`);
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(data.members || []);
      } else {
        throw new Error("Failed to load team members");
      }
    } catch (error) {
      console.error("Failed to load team members:", error);
      toast({
        title: "Error",
        description: "Failed to load team members",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateOwner(newOwnerId: string) {
    if (!canEdit) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_owner_id: newOwnerId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update owner");
      }

      setOwnerId(newOwnerId);
      toast({
        title: "Success",
        description: "Campaign owner updated",
      });
    } catch (error: any) {
      console.error("Failed to update owner:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update owner",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateVisibility(newVisibility: "workspace" | "restricted") {
    if (!canEdit && !(currentUserRole === "member" && ownerId === currentUserId)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: newVisibility }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update visibility");
      }

      setVisibility(newVisibility);
      toast({
        title: "Success",
        description: "Campaign visibility updated",
      });
    } catch (error: any) {
      console.error("Failed to update visibility:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update visibility",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const ownerMember = teamMembers.find((m) => m.user_id === ownerId);
  const ownerDisplayName = ownerMember
    ? ownerMember.name || ownerMember.email
    : ownerId
    ? ownerId.slice(0, 8) + "..."
    : "Unassigned";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sharing & Ownership</CardTitle>
        <CardDescription>
          Manage who owns this campaign and who can see it
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Owner Selection */}
        <div className="space-y-2">
          <Label htmlFor="owner-select">Owner</Label>
          {isReadOnly ? (
            <div className="text-sm text-muted-foreground py-2">
              {ownerDisplayName}
            </div>
          ) : (
            <Select
              value={ownerId || "none"}
              onValueChange={(value) => {
                if (value !== "none") {
                  updateOwner(value);
                }
              }}
              disabled={!canEdit || saving || loading}
            >
              <SelectTrigger id="owner-select" className="w-full">
                <SelectValue placeholder="Select owner" />
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : (
                  teamMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.name || member.email}
                      {member.role && ` (${member.role})`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            The owner is responsible for strategy and execution
          </p>
        </div>

        {/* Visibility Selection */}
        <div className="space-y-3">
          <Label>Visibility</Label>
          {isReadOnly ? (
            <div className="text-sm text-muted-foreground py-2">
              {visibility === "workspace" ? "Workspace" : "Restricted"}
            </div>
          ) : (
            <RadioGroup
              value={visibility}
              onValueChange={(value) =>
                updateVisibility(value as "workspace" | "restricted")
              }
              disabled={!canEdit || saving}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="workspace" id="visibility-workspace" />
                <Label
                  htmlFor="visibility-workspace"
                  className="font-normal cursor-pointer"
                >
                  <div className="font-medium">Workspace</div>
                  <div className="text-xs text-muted-foreground">
                    Everyone in this workspace can see and collaborate
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="restricted" id="visibility-restricted" />
                <Label
                  htmlFor="visibility-restricted"
                  className="font-normal cursor-pointer"
                >
                  <div className="font-medium">Restricted</div>
                  <div className="text-xs text-muted-foreground">
                    Only Owner/Admins can see and edit
                  </div>
                </Label>
              </div>
            </RadioGroup>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

