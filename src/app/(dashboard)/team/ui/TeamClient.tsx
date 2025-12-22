"use client";

import * as React from "react";
import { toast } from "sonner";
import { canInvite, canManageTeam, getCurrentUserRole } from "@/lib/permissions";

type Member = { 
  user_id: string; 
  role: "owner"|"admin"|"member"|"viewer"; 
  email?: string | null;
  name?: string | null;
  invited_at?: string | null;
  accepted_at?: string | null;
};

type Metric = {
  user_id: string;
  email?: string | null;
  emails_sent: number;
  replies_received: number;
  meetings_booked: number;
  opens: number;
  clicks: number;
  updated_at?: string | null;
};

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <p className="text-sm flex justify-between">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </p>
  );
}

export default function TeamClient() {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [metrics, setMetrics] = React.useState<Metric[]>([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"owner"|"admin"|"member"|"viewer">("member");
  const [ws, setWs] = React.useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = React.useState<"owner"|"admin"|"member"|"viewer" | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const wsRes = await fetch("/api/me/workspace");
      const wsJson = wsRes.ok ? await wsRes.json() : null;
      setWs(wsJson?.workspaceId ?? null);

      if (wsJson?.workspaceId) {
        // Get current user
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          const userRole = await getCurrentUserRole(wsJson.workspaceId, user.id);
          setCurrentUserRole(userRole);
        }

        const qs = new URLSearchParams({ workspaceId: wsJson.workspaceId });
        const mRes = await fetch(`/api/team/members?${qs.toString()}`);
        if (mRes.ok) {
          const membersData = await mRes.json();
          setMembers(membersData);
        }

        // Load metrics
        const metricsRes = await fetch(`/api/team/metrics?workspace_id=${wsJson.workspaceId}`);
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData.metrics || []);
        }
      }
    } catch (error) {
      console.error("Error loading team:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createInvite = async () => {
    if (!ws || !email.trim()) return;
    
    if (!currentUserRole || !canInvite(currentUserRole)) {
      toast.error("You don't have permission to invite members");
      return;
    }

    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role })
    });
    
    if (!res.ok) {
      const error = await res.json();
      toast.error(error.error || "Failed to send invite");
      return;
    }
    
    setEmail("");
    toast.success("Invite sent");
    await load();
  };

  const updateRole = async (userId: string, newRole: "owner"|"admin"|"member"|"viewer") => {
    if (!ws || !canManageTeam(currentUserRole!)) {
      toast.error("You don't have permission to change roles");
      return;
    }

    // TODO: Implement role update API
    toast.info("Role updates are not available right now.");
  };

  const canInviteMembers = currentUserRole && canInvite(currentUserRole);
  const canManageMembers = currentUserRole && canManageTeam(currentUserRole);

  // Sort metrics by meetings booked for leaderboard
  const sortedMetrics = [...metrics].sort(
    (a, b) => b.meetings_booked - a.meetings_booked
  );

  return (
    <div className="grid gap-6">
      {/* Team Analytics */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Team Analytics</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading metrics...</div>
          ) : metrics.length === 0 ? (
            <div className="text-sm text-muted-foreground">No metrics available yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {metrics.map((m) => (
                <div key={m.user_id} className="rounded-md border p-4">
                  <p className="font-bold mb-2">{m.email || m.user_id.slice(0, 8) + "…"}</p>
                  <div className="space-y-1">
                    <MetricRow label="Emails Sent" value={m.emails_sent} />
                    <MetricRow label="Replies" value={m.replies_received} />
                    <MetricRow label="Meetings Booked" value={m.meetings_booked} />
                    <MetricRow label="Opens" value={m.opens} />
                    <MetricRow label="Clicks" value={m.clicks} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      {sortedMetrics.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Leaderboard</h2>
          </div>
          <div className="p-6">
            <ol className="list-decimal ml-4 space-y-2">
              {sortedMetrics.map((m) => (
                <li key={m.user_id} className="text-sm">
                  <span className="font-medium">{m.email || m.user_id.slice(0, 8) + "…"}</span>
                  {" – "}
                  <span className="font-semibold">{m.meetings_booked}</span> meetings
                  {" • "}
                  <span className="text-muted-foreground">{m.replies_received} replies</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Members Card */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Team Members</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Name / Email</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    {canManageMembers && <th className="px-3 py-2 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => {
                    const isAccepted = m.accepted_at !== null;
                    const displayName = m.name || m.email || m.user_id.slice(0, 8) + "…";
                    return (
                      <tr key={m.user_id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{displayName}</div>
                          {m.email && m.email !== displayName && (
                            <div className="text-xs text-muted-foreground">{m.email}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {m.role}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {isAccepted ? (
                            <span className="text-xs text-green-600">Active</span>
                          ) : (
                            <span className="text-xs text-orange-600">Pending</span>
                          )}
                        </td>
                        {canManageMembers && (
                          <td className="px-3 py-2">
                            {m.user_id !== currentUserId && (
                              <select
                                className="text-xs border rounded px-2 py-1"
                                value={m.role}
                                onChange={(e) => updateRole(m.user_id, e.target.value as any)}
                                disabled={m.role === 'owner'}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                {currentUserRole === 'owner' && <option value="owner">Owner</option>}
                              </select>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!members.length && (
                    <tr>
                      <td className="px-3 py-4 text-center text-muted-foreground" colSpan={canManageMembers ? 4 : 3}>
                        No members yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invite Form */}
      {canInviteMembers && (
        <div className="rounded-lg border bg-card">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Invite Teammate</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                className="sm:col-span-3 px-3 py-2 border rounded-md"
                placeholder="teammate@company.com"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createInvite();
                  }
                }}
              />
              <select
                className="sm:col-span-1 px-3 py-2 border rounded-md"
                value={role}
                onChange={e=>setRole(e.target.value as any)}
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {currentUserRole === 'owner' && <option value="owner">Owner</option>}
              </select>
              <button
                className="sm:col-span-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                onClick={createInvite}
                disabled={loading || !email.trim()}
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
