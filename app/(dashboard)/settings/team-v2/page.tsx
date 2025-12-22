"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type TeamMember = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "manager" | "staff";
  created_at: string;
  auth_user_id: string | null;
};

type TeamInvite = {
  id: string;
  email: string;
  role: "owner" | "manager" | "staff";
  created_at: string;
  expires_at: string;
};

type Permissions = {
  manager_can_send: boolean;
  staff_can_update_pipeline: boolean;
};

export default function TeamSettingsPage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({
    manager_can_send: true,
    staff_can_update_pipeline: true,
  });
  const [seats, setSeats] = useState({ in_use: 0, allowed: 1 });
  const [currentUserRole, setCurrentUserRole] = useState<"owner" | "manager" | "staff" | null>(null);
  const [isAccountOwner, setIsAccountOwner] = useState(false);
  
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "staff">("manager");
  const [loading, setLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      // Get current user role
      const roleRes = await fetch("/api/settings/team/me");
      if (roleRes.ok) {
        const roleData = await roleRes.json();
        setCurrentUserRole(roleData.role);
        setIsAccountOwner(roleData.is_account_owner || false);
      }

      // Get team members and invites
      const res = await fetch("/api/settings/team/list");
      if (!res.ok) {
        throw new Error("Failed to load team data");
      }

      const data = await res.json();
      setMembers(data.members || []);
      setInvites(data.invites || []);
      setSeats(data.seats || { in_use: 0, allowed: 1 });

      // Get permissions
      const permRes = await fetch("/api/settings/permissions");
      if (permRes.ok) {
        const permData = await permRes.json();
        setPermissions(permData.permissions || permissions);
      }
    } catch (error) {
      console.error("Error loading team data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;

    try {
      setInviteLoading(true);
      const res = await fetch("/api/settings/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to send invite");
        return;
      }

      setInviteEmail("");
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
      const res = await fetch("/api/settings/team/remove", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to remove member");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Error removing member:", error);
      alert("Failed to remove member");
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!confirm("Are you sure you want to cancel this invite?")) return;

    try {
      const res = await fetch(`/api/settings/team/invites/${inviteId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to cancel invite");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Error canceling invite:", error);
      alert("Failed to cancel invite");
    }
  }

  async function handleChangeRole(userId: string, newRole: "manager" | "staff") {
    if (!confirm(`Change this user's role to ${newRole}?`)) return;

    try {
      const res = await fetch("/api/settings/team/change-role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to change role");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Error changing role:", error);
      alert("Failed to change role");
    }
  }

  async function handleResendInvite(inviteId: string) {
    try {
      const res = await fetch("/api/settings/team/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to resend invite");
        return;
      }

      await loadData();
      alert("Invitation resent!");
    } catch (error) {
      console.error("Error resending invite:", error);
      alert("Failed to resend invite");
    }
  }

  async function handlePermissionChange(key: keyof Permissions, value: boolean) {
    const newPermissions = { ...permissions, [key]: value };
    setPermissions(newPermissions);

    try {
      setSavingPermissions(true);
      const res = await fetch("/api/settings/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: newPermissions }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update permissions");
        await loadData(); // Reload to revert
        return;
      }
    } catch (error) {
      console.error("Error updating permissions:", error);
      alert("Failed to update permissions");
      await loadData(); // Reload to revert
    } finally {
      setSavingPermissions(false);
    }
  }

  const canInvite = currentUserRole === "owner" && seats.in_use < seats.allowed;
  const canManage = currentUserRole === "owner";

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold mb-4">Team Settings</div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Team Settings</h1>
        <p className="text-muted-foreground">
          Manage your team members, roles, and permissions
        </p>
      </div>

      {/* Seat Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Seat Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            <strong>{seats.in_use}</strong> of <strong>{seats.allowed}</strong> seats used
          </div>
          {seats.in_use >= seats.allowed && (
            <div className="mt-2 rounded-lg border border-amber-500 bg-amber-50 text-amber-900 p-3 text-sm">
              Seat limit reached. Upgrade your plan to add more team members.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Section */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Team Member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canInvite && (
              <div className="rounded-lg border border-amber-500 bg-amber-50 text-amber-900 p-3 text-sm">
                Seat limit reached. Upgrade your plan or remove members to invite more teammates.
              </div>
            )}
            <div className="flex gap-3">
              <Input
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
                type="email"
                disabled={!canInvite || inviteLoading}
              />
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as "manager" | "viewer")}
                disabled={!canInvite || inviteLoading}
              >
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
                disabled={!inviteEmail.trim() || inviteLoading || !canInvite}
              >
                {inviteLoading ? "Sending..." : "Invite"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invites ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invites.map((invite) => {
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
                          Role: <Badge variant="outline" className="capitalize">{invite.role}</Badge>
                          {" • "}
                          Expires in {expiresIn} day{expiresIn !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    {canManage && (
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
                <div className="col-span-4">Email</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Joined</div>
                <div className="col-span-4 text-right">Actions</div>
              </div>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-12 gap-4 items-center py-2 border-b last:border-0"
                >
                  <div className="col-span-4 font-medium">
                    {member.email}
                    {member.name && (
                      <div className="text-sm text-muted-foreground">{member.name}</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Badge variant="outline" className="capitalize">
                      {member.role}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </div>
                  <div className="col-span-4 flex justify-end gap-2">
                    {canManage && member.role !== "owner" && (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(newRole) => handleChangeRole(member.id, newRole as "manager" | "staff")}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemove(member.id)}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="font-medium">Managers can send campaigns</div>
                <div className="text-sm text-muted-foreground">
                  Allow managers to create and send campaigns (default: enabled)
                </div>
              </div>
              <Switch
                checked={permissions.manager_can_send}
                onCheckedChange={(checked) =>
                  handlePermissionChange("manager_can_send", checked)
                }
                disabled={savingPermissions}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="font-medium">Staff can update pipeline stage</div>
                <div className="text-sm text-muted-foreground">
                  Allow staff members to change lead pipeline stages (default: enabled)
                </div>
              </div>
              <Switch
                checked={permissions.staff_can_update_pipeline}
                onCheckedChange={(checked) =>
                  handlePermissionChange("staff_can_update_pipeline", checked)
                }
                disabled={savingPermissions}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}




