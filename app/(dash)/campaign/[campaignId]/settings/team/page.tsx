"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Member = { user_id: string; role: "owner" | "editor" | "viewer"; created_at: string };
type Invite = {
  email: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  expires_at: string;
  token: string;
};

export default function TeamPage() {
  const { campaignId } = useParams() as { campaignId: string };
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"owner" | "editor" | "viewer">("viewer");

  async function load() {
    const j = await fetch(`/api/campaign/${campaignId}/members`).then((r) => r.json());
    setMembers(j.members ?? []);
    setInvites(j.invites ?? []);
  }
  React.useEffect(() => {
    void load();
  }, [campaignId]);

  async function invite() {
    const j = await fetch(`/api/campaign/${campaignId}/members/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    }).then((r) => r.json());
    if (j?.url) {
      try {
        await navigator.clipboard.writeText(j.url);
      } catch {
        // ignore clipboard errors
      }
    }
    setEmail("");
    void load();
  }

  async function revoke(token: string) {
    await fetch(`/api/campaign/${campaignId}/invites/${token}/revoke`, { method: "POST" });
    void load();
  }

  async function changeRole(user_id: string, r: "owner" | "editor" | "viewer") {
    await fetch(`/api/campaign/${campaignId}/members/${user_id}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: r }),
    });
    void load();
  }

  return (
    <div className="p-4 space-y-6">
      <div className="text-xl font-semibold">Team</div>

      {/* Invite */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="font-medium">Invite a teammate</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className="rounded-md border p-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
          </select>
          <Button onClick={invite}>Create invite link</Button>
        </div>
        <div className="text-xs text-muted-foreground">
          We’ll copy the invite link to your clipboard; paste in chat/email.
        </div>
      </div>

      {/* Pending invites */}
      <div className="rounded-2xl border p-4">
        <div className="mb-2 font-medium">Pending invites</div>
        <div className="divide-y">
          {invites.map((i) => (
            <div key={i.token} className="flex items-center justify-between py-2">
              <div className="text-sm">
                {i.email} • {i.role} • Expires{" "}
                {new Date(i.expires_at).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/accept?token=${i.token}`,
                    )
                  }
                >
                  Copy link
                </Button>
                <Button variant="outline" size="sm" onClick={() => revoke(i.token)}>
                  Revoke
                </Button>
              </div>
            </div>
          ))}
          {!invites.length && (
            <div className="py-2 text-sm text-muted-foreground">No pending invites.</div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="rounded-2xl border p-4">
        <div className="mb-2 font-medium">Members</div>
        <div className="divide-y">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between py-2">
              <div className="text-sm">
                User {m.user_id.slice(0, 8)}… • Joined{" "}
                {new Date(m.created_at).toLocaleDateString()}
              </div>
              <select
                className="rounded-md border p-2 text-sm"
                value={m.role}
                onChange={(e) => changeRole(m.user_id, e.target.value as any)}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          ))}
          {!members.length && (
            <div className="py-2 text-sm text-muted-foreground">No members yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}



