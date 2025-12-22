"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export default function SharingModal({ campaignId, initialMembers, initialInvites }: any) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);

  async function invite() {
    const res = await fetch(`/api/campaigns/${campaignId}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role })
    });
    if (res.ok) {
      const { token } = await res.json();
      const link = `${window.location.origin}/join?token=${token}`;
      alert(`Invite created. Share this link:\n${link}`);
      setEmail("");
      setInvites((prev: any[]) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          email,
          role,
          status: "pending",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      ]);
    } else {
      alert(await res.text());
    }
  }

  async function setMemberRole(userId: string, newRole: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/members/${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole })
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    setMembers((m: any[]) => m.map((x) => (x.user_id === userId ? { ...x, role: newRole } : x)));
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/members/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    setMembers((m: any[]) => m.filter((x) => x.user_id !== userId));
  }

  return (
    <>
      <Button className="rounded-2xl" onClick={() => setOpen(true)}>
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share Campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="rounded-xl border p-3">
              <div className="text-sm mb-2">Invite a teammate</div>
              <div className="flex gap-2">
                <Input placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={invite}>Invite</Button>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm mb-2">Members</div>
              <div className="space-y-2">
                {members.map((m: any) => (
                  <div key={m.user_id} className="flex items-center justify-between rounded-lg border p-2">
                    <div className="text-sm">{m.user_id.slice(0, 8)}…</div>
                    <div className="flex items-center gap-2">
                      <Select value={m.role} onValueChange={(v) => setMemberRole(m.user_id, v)}>
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">viewer</SelectItem>
                          <SelectItem value="editor">editor</SelectItem>
                          <SelectItem value="owner">owner</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" onClick={() => removeMember(m.user_id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {members.length === 0 && <div className="text-xs text-muted-foreground">No members yet.</div>}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="text-sm mb-2">Pending Invitations</div>
              <div className="space-y-1">
                {invites.map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <div>
                      {i.email ?? i.invitee_email} — {i.role}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.status
                        ? i.status.charAt(0).toUpperCase() + i.status.slice(1)
                        : i.accepted_at
                        ? "Accepted"
                        : "Pending"}
                    </div>
                  </div>
                ))}
                {invites.length === 0 && <div className="text-xs text-muted-foreground">No pending invites.</div>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}



