"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type RoofingTeamRole = "OWNER" | "SALES_REP" | "OFFICE_STAFF" | "ADJUSTER_HELPER";

type TeamMember = {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  roofing_role: RoofingTeamRole;
  created_at: string;
};

type TeamInvite = {
  id: string;
  email: string;
  roofing_role: RoofingTeamRole;
  created_at: string;
};

/**
 * Block 20840 — SmartSend Roofing Team Permissions v1
 * Team Settings Page with Roofing-Specific Roles
 */
export default function RoofingTeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<RoofingTeamRole | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoofingTeamRole>("SALES_REP");
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const response = await fetch("/api/settings/team/roofing/list");
      if (!response.ok) {
        throw new Error("Failed to load team data");
      }

      const data = await response.json();
      setMembers(data.members || []);
      setPendingInvites(data.invites || []);
      setCurrentUserRole(data.current_user_role || null);
    } catch (error) {
      console.error("Error loading team data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!email.trim()) return;

    try {
      setInviteLoading(true);
      const response = await fetch("/api/settings/team/roofing/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), roofing_role: role }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to send invite");
        return;
      }

      setEmail("");
      await loadData();
    } catch (error) {
      console.error("Error sending invite:", error);
      alert("Failed to send invite");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleChangeRole(membershipId: string, newRole: RoofingTeamRole) {
    try {
      const response = await fetch("/api/settings/team/roofing/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: membershipId, roofing_role: newRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to update role");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role");
    }
  }

  const canManageMembers = currentUserRole === "OWNER";

  const getRoleBadgeColor = (role: RoofingTeamRole) => {
    switch (role) {
      case "OWNER":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "SALES_REP":
        return "bg-green-100 text-green-800 border-green-200";
      case "OFFICE_STAFF":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "ADJUSTER_HELPER":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRoleDescription = (role: RoofingTeamRole) => {
    switch (role) {
      case "OWNER":
        return "Full control: All leads, billing, team management";
      case "SALES_REP":
        return "Assigned leads only, can send proposals";
      case "OFFICE_STAFF":
        return "All leads (read), scheduling, homeowner emails";
      case "ADJUSTER_HELPER":
        return "Insurance/supplements, draft adjuster emails";
      default:
        return "";
    }
  };

  const getRoleDisplayName = (role: RoofingTeamRole) => {
    switch (role) {
      case "OWNER":
        return "Owner";
      case "SALES_REP":
        return "Sales Rep";
      case "OFFICE_STAFF":
        return "Office Staff";
      case "ADJUSTER_HELPER":
        return "Adjuster Helper";
      default:
        return role;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold mb-4">Team Members</div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Team Members</h1>
        <p className="text-muted-foreground">
          Manage your roofing team with role-based permissions. Each role has specific access levels designed for how roofing companies actually work.
        </p>
      </div>

      {/* Invite Section */}
      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Team Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
                type="email"
              />
              <Select value={role} onValueChange={(v) => setRole(v as RoofingTeamRole)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES_REP">Sales Rep</SelectItem>
                  <SelectItem value="OFFICE_STAFF">Office Staff</SelectItem>
                  <SelectItem value="ADJUSTER_HELPER">Adjuster Helper</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleInvite}
                disabled={!email.trim() || inviteLoading}
              >
                {inviteLoading ? "Sending..." : "Invite"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <div><strong>🟣 Owner:</strong> Full control - all leads, billing, team management</div>
              <div><strong>🟢 Sales Rep:</strong> Assigned leads only, can send proposals, see insurance basics</div>
              <div><strong>🟡 Office Staff:</strong> All leads (read), scheduling, homeowner emails, cannot change pricing</div>
              <div><strong>🔵 Adjuster Helper:</strong> Insurance/supplements focus, draft adjuster emails, cannot send proposals</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites ({pendingInvites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium">{invite.email}</div>
                      <div className="text-sm text-muted-foreground">
                        Role: <Badge className={getRoleBadgeColor(invite.roofing_role)}>
                          {getRoleDisplayName(invite.roofing_role)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No team members yet. Invite someone to get started.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-4 pb-2 border-b text-sm font-medium text-muted-foreground">
                <div className="col-span-4">Name / Email</div>
                <div className="col-span-3">Role</div>
                <div className="col-span-2">Joined</div>
                <div className="col-span-3 text-right">Actions</div>
              </div>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-12 gap-4 items-center py-2 border-b last:border-0"
                >
                  <div className="col-span-4">
                    <div className="font-medium">
                      {member.name || member.email || "Unknown"}
                    </div>
                    {member.name && member.email && (
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    )}
                  </div>
                  <div className="col-span-3">
                    {canManageMembers && member.roofing_role !== "OWNER" ? (
                      <Select
                        value={member.roofing_role}
                        onValueChange={(newRole) => handleChangeRole(member.id, newRole as RoofingTeamRole)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SALES_REP">Sales Rep</SelectItem>
                          <SelectItem value="OFFICE_STAFF">Office Staff</SelectItem>
                          <SelectItem value="ADJUSTER_HELPER">Adjuster Helper</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-1">
                        <Badge className={getRoleBadgeColor(member.roofing_role)}>
                          {getRoleDisplayName(member.roofing_role)}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {getRoleDescription(member.roofing_role)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </div>
                  <div className="col-span-3 flex justify-end gap-2">
                    {canManageMembers && member.roofing_role !== "OWNER" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("Are you sure you want to remove this team member?")) {
                            // TODO: Implement remove functionality
                            alert("Remove functionality coming soon");
                          }
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
















































