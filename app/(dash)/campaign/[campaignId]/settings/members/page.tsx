"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function MembersPage() {
  const { campaignId } = useParams() as { campaignId: string };
  const [members, setMembers] = React.useState<any[]>([]);
  const [invites, setInvites] = React.useState<any[]>([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"viewer" | "editor" | "owner">("viewer");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    void refresh();
  }, [campaignId]);

  async function refresh() {
    const m = await fetch(`/api/campaign/${campaignId}/members`).then((r) => r.json());
    const i = await fetch(`/api/campaign/${campaignId}/invites`).then((r) => r.json());
    setMembers(m.members ?? []);
    setInvites(i.invites ?? []);
  }

  async function invite() {
    const inviteEmail = email;
    setLoading(true);
    const r = await fetch(`/api/campaign/${campaignId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    }).then((r) => r.json());
    setLoading(false);
    setEmail("");
    await refresh();
    if (r?.invite?.token) {
      const link = `${window.location.origin}/accept?token=${encodeURIComponent(r.invite.token)}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // ignore clipboard errors
      }
      try {
        await fetch("/functions/v1/send-invite-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: inviteEmail, link }),
        });
      } catch {
        // ignore email delivery errors for now
      }
      alert("Invite created. Link copied to clipboard.");
    }
  }

  async function changeRole(user_id: string, role: string) {
    await fetch(`/api/campaign/${campaignId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, role }),
    });
    await refresh();
  }

  async function remove(user_id: string) {
    await fetch(`/api/campaign/${campaignId}/members?user_id=${user_id}`, { method: "DELETE" });
    await refresh();
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/campaign/${campaignId}/invites?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="p-4 space-y-6">
      <div className="text-xl font-semibold">Team & Access</div>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="font-medium">Invite teammate</div>
        <div className="grid gap-2 md:grid-cols-5">
          <input
            className="rounded-md border p-2 text-sm md:col-span-3"
            placeholder="email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className="rounded-md border p-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
          </select>
          <Button onClick={invite} disabled={loading || !email}>
            Invite
          </Button>
        </div>
        {!!invites.length && (
          <div className="pt-3">
            <div className="text-sm text-muted-foreground mb-1">Pending invites</div>
            <div className="rounded-xl border divide-y">
              {invites.map((i: any) => (
                <div key={i.id} className="p-3 flex items-center justify-between">
                  <div className="text-sm">
                    {i.email} • {i.role} • expires {new Date(i.expires_at).toLocaleDateString()}
                    {i.accepted_at && <span className="ml-2 text-xs">accepted</span>}
                  </div>
                  {!i.accepted_at && (
                    <Button variant="outline" size="sm" onClick={() => revokeInvite(i.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4">
        <div className="font-medium mb-2">Members</div>
        <div className="rounded-xl border divide-y">
          {members.map((m: any) => (
            <div key={m.id} className="p-3 flex items-center justify-between gap-2">
              <div className="text-sm">{m.user?.email ?? m.user_id}</div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-md border p-1 text-sm"
                  value={m.role}
                  onChange={(e) => changeRole(m.user_id, e.target.value)}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => remove(m.user_id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {!members.length && <div className="p-3 text-sm text-muted-foreground">No members yet.</div>}
        </div>
      </div>
    </div>
  );
}

