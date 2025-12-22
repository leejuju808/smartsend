"use client";

// Block 416 — Team Collaboration v1: Team Access Panel
// Per-campaign permissions UI (View, Edit, Send, Analytics)

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Member = {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  workspace_role: string;
  can_view: boolean;
  can_edit: boolean;
  can_send: boolean;
  can_view_analytics: boolean;
  permission_id?: string;
};

export function TeamAccessPanel({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"owner" | "manager" | "member">("member");
  const [inviting, setInviting] = React.useState(false);

  const loadMembers = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/permissions`);
      if (!res.ok) {
        throw new Error("Failed to load team members");
      }
      const data = await res.json();
      setMembers(data.members || []);
    } catch (error) {
      console.error("Error loading members:", error);
      toast.error("Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const updatePermission = async (
    userId: string,
    permission: "can_view" | "can_edit" | "can_send" | "can_view_analytics",
    value: boolean
  ) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, permission, value }),
      });

      if (!res.ok) {
        throw new Error("Failed to update permission");
      }

      // Update local state
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId ? { ...m, [permission]: value } : m
        )
      );

      toast.success("Permission updated");
    } catch (error) {
      console.error("Error updating permission:", error);
      toast.error("Failed to update permission");
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email required");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to invite");
      }

      toast.success("Invite sent");
      setInviteEmail("");
      await loadMembers();
    } catch (error: any) {
      console.error("Error inviting:", error);
      toast.error(error.message || "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Loading team access...</div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <CardHeader>
        <CardTitle>Team Access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite Form */}
        <div className="flex gap-2 flex-wrap items-center pb-4 border-b">
          <Input
            placeholder="Invite by email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="max-w-xs"
            type="email"
          />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleInvite} disabled={inviting}>
            {inviting ? "Inviting…" : "Invite"}
          </Button>
        </div>

        {/* Permissions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">Member</th>
                <th className="text-center py-2 px-2">View</th>
                <th className="text-center py-2 px-2">Edit</th>
                <th className="text-center py-2 px-2">Send</th>
                <th className="text-center py-2 px-2">Analytics</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted-foreground">
                    No team members yet. Invite someone to get started.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="border-b">
                    <td className="py-2 px-2">
                      <div>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {member.workspace_role}
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-2 px-2">
                      <Switch
                        checked={member.can_view}
                        onCheckedChange={(v) =>
                          member.user_id &&
                          updatePermission(member.user_id, "can_view", v)
                        }
                        disabled={!member.user_id}
                      />
                    </td>
                    <td className="text-center py-2 px-2">
                      <Switch
                        checked={member.can_edit}
                        onCheckedChange={(v) =>
                          member.user_id &&
                          updatePermission(member.user_id, "can_edit", v)
                        }
                        disabled={!member.user_id}
                      />
                    </td>
                    <td className="text-center py-2 px-2">
                      <Switch
                        checked={member.can_send}
                        onCheckedChange={(v) =>
                          member.user_id &&
                          updatePermission(member.user_id, "can_send", v)
                        }
                        disabled={!member.user_id}
                      />
                    </td>
                    <td className="text-center py-2 px-2">
                      <Switch
                        checked={member.can_view_analytics}
                        onCheckedChange={(v) =>
                          member.user_id &&
                          updatePermission(member.user_id, "can_view_analytics", v)
                        }
                        disabled={!member.user_id}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}



