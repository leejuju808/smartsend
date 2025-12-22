"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  role: "owner" | "editor" | "viewer";
  created_at: string;
};

type Invite = {
  id: string;
  email: string;
  role: "viewer" | "editor";
  created_at: string;
  invited_by: string | null;
  accepted_at: string | null;
};

function niceErr(e?: any) {
  const msg = (typeof e === "string" ? e : e?.error) ?? "Action failed";
  if (String(msg).includes("last owner")) return "You are the last owner. Assign another owner before removing/demoting.";
  return msg;
}

export function TeamPanel({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"viewer" | "editor">("viewer");
  const [meId, setMeId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const r = await fetch(`/api/campaign/${campaignId}/members`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      toast.error(j?.error ?? "Failed to load team");
      return;
    }

    setMembers(j.members ?? []);
    setInvites(j.invites ?? []);
  }, [campaignId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/me`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json().catch(() => ({}));
      if (cancelled) return;
      if (j?.id) setMeId(j.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function invite() {
    if (!email.trim()) {
      toast.error("Email required");
      return;
    }

    setLoading(true);
    const r = await fetch(`/api/campaign/${campaignId}/members/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const j = await r.json().catch(() => ({}));
    setLoading(false);

    if (!r.ok) {
      toast.error(j?.error ?? "Invite failed");
      return;
    }

    toast.success(j.added ? "Member added" : "Invite sent");
    setEmail("");
    await load();
  }

  async function changeRole(memberId: string, newRole: "viewer" | "editor" | "owner") {
    const r = await fetch(`/api/campaign/${campaignId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      toast.error(niceErr(j));
      return;
    }

    toast.success("Role updated");
    await load();
  }

  async function remove(memberId: string) {
    const r = await fetch(`/api/campaign/${campaignId}/members/${memberId}`, {
      method: "DELETE",
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      toast.error(niceErr(j));
      return;
    }

    toast.success("Removed");
    await load();
  }

  async function leave() {
    const r = await fetch(`/api/campaign/${campaignId}/members/leave`, { method: "POST" });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      toast.error(niceErr(j));
      return;
    }

    toast.success("Left campaign");
    await load();
  }

  async function cancelInvite(inviteId: string) {
    const r = await fetch(`/api/campaign/${campaignId}/invites/${inviteId}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      toast.error(j?.error ?? "Cancel failed");
      return;
    }

    toast.success("Invite canceled");
    await load();
  }

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="Invite by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs"
        />
        <Select value={role} onValueChange={(v) => setRole(v as "viewer" | "editor")}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">viewer</SelectItem>
            <SelectItem value="editor">editor</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={invite} disabled={loading}>
          {loading ? "Inviting…" : "Invite"}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Members</div>
        <div className="grid gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between border rounded-lg p-2">
              <div className="text-sm">
                <div className="font-medium">{m.email ?? m.user_id}</div>
                <div className="text-xs text-muted-foreground">
                  since {new Date(m.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as Member["role"]))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">viewer</SelectItem>
                    <SelectItem value="editor">editor</SelectItem>
                    <SelectItem value="owner">owner</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => (meId && m.user_id === meId ? leave() : remove(m.id))}
                >
                  {meId && m.user_id === meId ? "Leave" : "Remove"}
                </Button>
              </div>
            </div>
          ))}
          {members.length === 0 && <div className="text-sm text-muted-foreground">No members yet.</div>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Pending invites</div>
        <div className="grid gap-2">
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between border rounded-lg p-2">
              <div className="text-sm">
                <div className="font-medium">{i.email}</div>
                <div className="text-xs text-muted-foreground">
                  {i.role} · invited {new Date(i.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => cancelInvite(i.id)}>
                  Cancel
                </Button>
              </div>
            </div>
          ))}
          {invites.length === 0 && <div className="text-sm text-muted-foreground">No pending invites.</div>}
        </div>
      </div>
    </div>
  );
}

