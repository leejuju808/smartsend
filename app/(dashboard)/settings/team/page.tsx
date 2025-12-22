"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type TeamMember = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "manager" | "staff";
  created_at: string;
  auth_user_id: string | null;
  assigned_leads?: string[] | null;
};

type TeamInvite = {
  id: string;
  email: string;
  role: "owner" | "manager" | "staff";
  created_at: string;
  expires_at: string;
};

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<"owner" | "manager" | "staff" | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("manager");
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [seats, setSeats] = useState<{ in_use: number; allowed: number } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const response = await fetch("/api/settings/team/list");
      if (!response.ok) {
        throw new Error("Failed to load team data");
      }

      const data = await response.json();
      setMembers(data.members || []);
      setPendingInvites(data.invites || []);
      setSeats(data.seats || { in_use: 0, allowed: 1 });

      // Get current user's role
      const currentMember = data.members?.find((m: TeamMember) => m.auth_user_id);
      if (currentMember) {
        setCurrentUserRole(currentMember.role);
      } else {
        // Check if user is account owner
        const meResponse = await fetch("/api/settings/team/me");
        if (meResponse.ok) {
          const meData = await meResponse.json();
          if (meData.is_account_owner) {
            setCurrentUserRole("owner");
          }
        }
      }
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
      const response = await fetch("/api/settings/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
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

  async function handleRemove(userId: string) {
    if (!confirm("Are you sure you want to remove this team member?")) return;

    try {
      const response = await fetch("/api/settings/team/remove", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to remove member");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Error removing member:", error);
      alert("Failed to remove member");
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    try {
      const response = await fetch("/api/settings/team/change-role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
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

  async function handleResendInvite(inviteId: string) {
    try {
      const response = await fetch(`/api/settings/team/resend-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to resend invite");
        return;
      }

      alert("Invite resent successfully");
      await loadData();
    } catch (error) {
      console.error("Error resending invite:", error);
      alert("Failed to resend invite");
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!confirm("Are you sure you want to cancel this invite?")) return;

    try {
      const response = await fetch(`/api/settings/team/invites/${inviteId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to cancel invite");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Error canceling invite:", error);
      alert("Failed to cancel invite");
    }
  }

  const canInvite = currentUserRole === "owner" && 
    (seats ? seats.in_use < seats.allowed : true);
  
  const canManageMembers = currentUserRole === "owner";

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-red-100 text-red-800 border-red-200";
      case "manager":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "staff":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case "owner":
        return "Full access + billing";
      case "manager":
        return "Campaigns + leads, no billing";
      case "staff":
        return "Assigned leads only";
      default:
        return "";
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
          Manage your team members and their roles. Owners have full control, Managers can create campaigns and manage leads, and Staff can only access assigned leads.
        </p>
      </div>

      {/* Seat Usage */}
      {seats && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Seats Used</div>
                <div className="text-2xl font-semibold">
                  {seats.in_use} / {seats.allowed}
                </div>
              </div>
              {seats.in_use >= seats.allowed && (
                <Button onClick={() => router.push("/settings/billing")}>
                  Upgrade Plan
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Section */}
      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Team Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {seats && seats.in_use >= seats.allowed && (
              <div className="rounded-lg border border-amber-500 bg-amber-50 text-amber-900 p-3 text-sm">
                Seat limit reached. Upgrade your plan or remove members to invite more teammates.
              </div>
            )}
            <div className="flex gap-3">
              <Input
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
                type="email"
              />
              <Select value={role} onValueChange={(v) => setRole(v as "manager" | "staff")}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleInvite}
                disabled={!email.trim() || inviteLoading || !canInvite}
              >
                {inviteLoading ? "Sending..." : "Invite"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div><strong>Manager:</strong> Can create campaigns, manage leads, view inbox. Cannot access billing.</div>
              <div><strong>Staff:</strong> Can only view and manage assigned leads. Cannot send campaigns or import.</div>
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
              {pendingInvites.map((invite) => {
                const expiresIn = Math.ceil(
                  (new Date(invite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-medium">{invite.email}</div>
                        <div className="text-sm text-muted-foreground">
                          Role: <Badge className={`capitalize ${getRoleBadgeColor(invite.role)}`}>
                            {invite.role}
                          </Badge>
                          {" • "}
                          Expires in {expiresIn} day{expiresIn !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    {canManageMembers && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResendInvite(invite.id)}
                        >
                          Resend
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleCancelInvite(invite.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Joined</div>
                <div className="col-span-4 text-right">Actions</div>
              </div>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-12 gap-4 items-center py-2 border-b last:border-0"
                >
                  <div className="col-span-4">
                    <div className="font-medium">
                      {member.name || member.email}
                    </div>
                    {member.name && (
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    )}
                    {member.role === "staff" && member.assigned_leads && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {Array.isArray(member.assigned_leads) ? member.assigned_leads.length : 0} assigned leads
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    {canManageMembers && member.role !== "owner" ? (
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => handleChangeRole(member.id, newRole)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          {currentUserRole === "owner" && (
                            <SelectItem value="owner">Owner</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-1">
                        <Badge className={`capitalize ${getRoleBadgeColor(member.role)}`}>
                          {member.role}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {getRoleDescription(member.role)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </div>
                  <div className="col-span-4 flex justify-end gap-2">
                    {canManageMembers && member.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemove(member.id)}
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
