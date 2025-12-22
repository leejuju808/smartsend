"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Member = { id: string; user_id: string; role: "owner" | "editor" | "viewer"; users?: { email?: string } };

export function CampaignMembersCard({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = React.useState<Member[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/campaign/${campaignId}/members`);
    const j = await r.json().catch(() => ({}));
    setRows(j.members ?? []);
    setLoading(false);
    setInviteLink(null);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invite() {
    const r = await fetch(`/api/campaign/${campaignId}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(j?.error ?? "Invite failed");
    if (j.mode === "added") {
      toast.success("Member added");
      setInviteEmail("");
      load();
    } else {
      setInviteLink(j.link);
      toast.success("Invite created — copy link below");
    }
  }

  async function changeRole(id: string, role: "owner" | "editor" | "viewer") {
    const r = await fetch(`/api/campaign/${campaignId}/members/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!r.ok) toast.error("Role update failed");
    else {
      toast.success("Role updated");
      load();
    }
  }

  async function remove(id: string) {
    const r = await fetch(`/api/campaign/${campaignId}/members/${id}`, { method: "DELETE" });
    if (!r.ok) toast.error("Remove failed");
    else {
      toast.success("Removed");
      load();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite */}
        <div className="rounded-md border p-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div>
              <Label>Email</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <Label>Role</Label>
              <select
                className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={invite} disabled={!inviteEmail}>
                Invite
              </Button>
            </div>
          </div>
          {inviteLink && (
            <div className="mt-2">
              <Label>Invite Link</Label>
              <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
        </div>

        {/* Members list */}
        <div className="overflow-x-auto rounded-md border">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No members yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">{m.users?.email ?? m.user_id}</td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-md border bg-background p-1 text-sm"
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as Member["role"])}
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => remove(m.id)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


