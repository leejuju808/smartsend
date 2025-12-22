/**
 * Block 12900: Team Settings Page
 * Organization Roles & Permissions v1 - Team Management UI
 */

"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type TeamMember = {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  role: "owner" | "manager" | "staff" | "read_only";
  status: string;
  created_at: string;
};

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<"owner" | "manager" | "staff" | "read_only" | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "staff" | "read_only">("staff");
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadData();
  }, []);

  // Permission helpers
  const Permissions = {
    canAddUser: (role: typeof currentUserRole) => role === "owner" || role === "manager",
    canChangeRole: (role: typeof currentUserRole) => role === "owner" || role === "manager",
    canRemoveUser: (role: typeof currentUserRole) => role === "owner" || role === "manager",
  };

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      // Fetch team members (includes current user role)
      const response = await fetch("/api/team/members");
      if (!response.ok) {
        throw new Error("Failed to load team members");
      }

      const data = await response.json();
      setMembers(data.members || []);

      // Get current user's role from members list
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const currentMember = data.members?.find((m: TeamMember) => m.user_id === user.id);
        if (currentMember) {
          setCurrentUserRole(currentMember.role);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    try {
      setInviteLoading(true);
      setError(null);

      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to invite user");
      }

      setEmail("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to invite user");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleChangeRole(memberId: string, newRole: "owner" | "manager" | "staff" | "read_only") {
    try {
      setError(null);

      const response = await fetch(`/api/team/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update role");
      }

      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Are you sure you want to remove this team member?")) {
      return;
    }

    try {
      setError(null);

      const response = await fetch(`/api/team/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to remove member");
      }

      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    }
  }

  const canInvite = Permissions.canAddUser(currentUserRole);
  const canChangeRole = Permissions.canChangeRole(currentUserRole);
  const canRemove = Permissions.canRemoveUser(currentUserRole);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading team members...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Team Members</h1>
        <p className="text-muted-foreground">
          Manage your team members and their roles (Block 12900)
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 text-red-900 p-3 text-sm">
          {error}
        </div>
      )}

      {/* Invite Section */}
      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Teammate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                type="email"
                placeholder="Teammate email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="read_only">Read-Only</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleInvite}
                disabled={!email.trim() || inviteLoading}
              >
                {inviteLoading ? "Inviting..." : "Invite"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              <strong>Manager:</strong> Can use everything except billing and plan changes
              <br />
              <strong>Staff:</strong> Limited day-to-day operations access (inbox, pipeline updates)
              <br />
              <strong>Read-Only:</strong> Can view everything except billing and sending identities
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm">No members yet</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {member.name || member.email}
                      </span>
                      {member.name && (
                        <span className="text-sm text-muted-foreground">
                          ({member.email})
                        </span>
                      )}
                      <Badge
                        variant={
                          member.role === "owner"
                            ? "default"
                            : member.role === "manager"
                            ? "secondary"
                            : "outline"
                        }
                        className="capitalize"
                      >
                        {member.role === "read_only" ? "Read-Only" : member.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canChangeRole && member.role !== "owner" && (
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          handleChangeRole(member.id, v as any)
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {member.role !== "owner" && (
                            <>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="read_only">Read-Only</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    {canRemove && member.role !== "owner" && (
                      <Button
                        variant="destructive"
                        size="sm"
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

      {/* Permission Matrix Info */}
      <Card>
        <CardHeader>
          <CardTitle>Permission Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <div className="grid grid-cols-5 gap-2 font-medium border-b pb-2">
              <div>Action</div>
              <div className="text-center">Owner</div>
              <div className="text-center">Manager</div>
              <div className="text-center">Staff</div>
              <div className="text-center">Read-Only</div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>Create Campaign</div>
              <div className="text-center">✓</div>
              <div className="text-center">✓</div>
              <div className="text-center">✗</div>
              <div className="text-center">✗</div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>Edit Contacts</div>
              <div className="text-center">✓</div>
              <div className="text-center">✓</div>
              <div className="text-center">✓</div>
              <div className="text-center">✗</div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>View Revenue</div>
              <div className="text-center">✓</div>
              <div className="text-center">✓</div>
              <div className="text-center">✗</div>
              <div className="text-center">✗</div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>Manage Billing</div>
              <div className="text-center">✓</div>
              <div className="text-center">✗</div>
              <div className="text-center">✗</div>
              <div className="text-center">✗</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

