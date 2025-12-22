"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/badge";

type Member = { user_id: string; email: string | null; role: "owner"|"viewer"|"editor" };

export function ShareDrawer({ campaignId, open, onOpenChange }:{
  campaignId: string;
  open: boolean;
  onOpenChange: (b:boolean)=>void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer"|"editor">("viewer");
  const [loading, setLoading] = useState(false);

  async function load() {
    const r = await fetch(`/api/campaigns/${campaignId}/members`);
    const j = await r.json();
    setMembers(j.members || []);
  }

  useEffect(() => { 
    if (open) load(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function invite() {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/shares`, {
        method: "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ email, role })
      });
      const j = await r.json();
      if (r.ok) {
        setEmail("");
        await load();
      } else {
        alert(j.error || "Invite failed");
      }
    } finally { setLoading(false); }
  }

  async function changeRole(user_id: string, newRole: "viewer"|"editor") {
    const r = await fetch(`/api/campaigns/${campaignId}/shares`, {
      method: "PATCH",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ user_id, role: newRole })
    });
    if (!r.ok) alert((await r.json()).error || "Update failed");
    await load();
  }

  async function remove(user_id: string) {
    const r = await fetch(`/api/campaigns/${campaignId}/shares?user_id=${user_id}`, { method: "DELETE" });
    if (!r.ok) alert((await r.json()).error || "Remove failed");
    await load();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-4">
        <SheetHeader>
          <SheetTitle>Share campaign</SheetTitle>
        </SheetHeader>

        <div className="grid gap-4 mt-4">
          <div className="grid md:grid-cols-3 gap-2">
            <Input placeholder="teammate@email.com" value={email} onChange={e=>setEmail(e.target.value)} />
            <select className="border rounded-md px-2" value={role} onChange={e=>setRole(e.target.value as any)}>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <Button onClick={invite} disabled={!email || loading}>{loading ? "Inviting..." : "Invite"}</Button>
          </div>

          <div className="border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Member</th>
                  <th className="text-left p-2">Role</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.user_id} className="border-t">
                    <td className="p-2">
                      <div className="text-sm">
                        <div className="font-medium">{m.email ?? m.user_id}</div>
                        <div className="text-xs text-muted-foreground">{m.email ? "email" : "member id"}</div>
                      </div>
                    </td>
                    <td className="p-2">
                      {m.role === "owner" ? (
                        <Badge>Owner</Badge>
                      ) : (
                        <select
                          className="border rounded-md px-2 py-1"
                          value={m.role}
                          onChange={e=>changeRole(m.user_id, e.target.value as any)}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {m.role === "owner" ? null : (
                        <Button variant="ghost" onClick={()=>remove(m.user_id)}>Remove</Button>
                      )}
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td className="p-3 text-muted-foreground" colSpan={3}>No members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

