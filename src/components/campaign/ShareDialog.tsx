"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function ShareDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer"|"editor">("viewer");
  const [invites, setInvites] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/campaigns/${campaignId}/invites`, { cache: "no-store" });
    const json = await res.json();
    setInvites(json.items || []);
  }

  async function createInvite() {
    setCreating(true);
    await fetch(`/api/campaigns/${campaignId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    }).then(()=>refresh()).finally(()=>setCreating(false));
    setEmail("");
  }

  useEffect(() => { if (open) refresh(); }, [open]); // eslint-disable-line

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Share</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invite form */}
          <div className="flex gap-2">
            <Input placeholder="teammate@email.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
            <Select value={role} onValueChange={(v:any)=>setRole(v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={createInvite} disabled={!email || creating}>Invite</Button>
          </div>

          {/* Active invites */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Pending invites</div>
            <div className="rounded border divide-y">
              {invites.length === 0 && <div className="p-3 text-sm text-muted-foreground">No pending invites.</div>}
              {invites.map((i:any) => (
                <div key={i.id} className="p-3 flex items-center gap-3">
                  <div className="truncate">{i.email}</div>
                  <Badge variant="outline">{i.role.toUpperCase()}</Badge>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {i.accepted_at ? "Accepted" : `Expires ${new Date(i.expires_at).toLocaleDateString()}`}
                  </div>
                  {!i.accepted_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/accept?token=${i.token}`)}
                    >
                      Copy link
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Owners can invite teammates. Editors can edit content but cannot manage members. Viewers can view analytics.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
