"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Member = { 
  user_id: string; 
  role: "owner"|"editor"|"viewer"; 
  created_at?: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
};
type InviteRes = { ok: boolean; inviteUrl?: string; error?: string };

export function MembersPanel({ campaignId, isOwner }: { campaignId: string; isOwner: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor"|"viewer">("editor");
  const [busy, setBusy] = useState(false);
  const [copyUrl, setCopyUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/members`);
      if (res.ok) {
        const json = await res.json();
        setMembers(json.members || []);
      } else {
        setMembers([]);
      }
    } catch {
      setMembers([]);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignId]);

  async function invite() {
    setBusy(true); setError(null); setCopyUrl(null);
    try {
      const res = await fetch("/api/campaigns/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, email, role }),
      });
      const json: InviteRes = await res.json();
      if (!res.ok) throw new Error(json.error || "Invite failed");
      setCopyUrl(json.inviteUrl || null);
      setEmail("");
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, newRole: "editor"|"viewer") {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/members/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Change role failed");
      }
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(memberUserId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns/members/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, memberUserId }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Remove failed");
      }
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Team</h3>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="teammate@email.com" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-[260px]" />
          <Select value={role} onValueChange={(v)=>setRole(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={!email || busy}>Invite</Button>
          {copyUrl && (
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(copyUrl!)}>Copy Invite Link</Button>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs text-muted-foreground">User</th>
              <th className="text-left p-3 text-xs text-muted-foreground">Role</th>
              <th className="text-left p-3 text-xs text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(r => (
              <tr key={r.user_id} className="border-t">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                    ) : null}
                    <div className="text-sm">
                      {r.full_name ? <div className="font-medium text-xs">{r.full_name}</div> : null}
                      <div className={r.full_name ? "text-xs text-muted-foreground" : "font-medium text-xs"}>{r.email ?? r.user_id}</div>
                      <div className="text-[11px] text-muted-foreground">{r.email ? "email" : "member id"}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-xs capitalize">
                  {r.role}
                  {r.role === "owner" && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100/10 border border-amber-300/30 text-amber-300">
                      Owner
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {r.role !== "owner" ? (
                    <div className="flex gap-2">
                      <Select onValueChange={(v)=>changeRole(r.user_id, v as "editor"|"viewer")} value={r.role}>
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue placeholder="Change role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" className="h-8" onClick={()=>remove(r.user_id)} disabled={busy}>
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-sm text-muted-foreground">No members yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


