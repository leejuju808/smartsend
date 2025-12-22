"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/hooks/useRole";
import { can } from "@/lib/auth/permissions";
import { toast } from "sonner";

type Member = { user_id: string; name?: string|null; email?: string|null; role: "admin"|"sender"|"viewer" };

export default function ShareCampaignButton({ campaignId }: { campaignId: string }) {
  const userRole = useRole(campaignId);
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("sender");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const canInvite = can(userRole, "canInvite");

  async function load() {
    const res = await fetch(`/api/campaigns/${campaignId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members || []);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function addByEmail() {
    if (!canInvite) {
      toast.error("You don't have permission to invite members. Admin access required.");
      return;
    }

    setBusy(true);
    setInviteLink(null);
    const res = await fetch(`/api/campaigns/${campaignId}/share-new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { 
      toast.error(data.message || data.error || "Failed to invite member");
      return; 
    }
    if (data.invited && data.link) setInviteLink(data.link);
    setEmail("");
    await load();
    toast.success("Member invited successfully");
  }

  async function remove(user_id: string) {
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/share-new`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id }),
    });
    setBusy(false);
    if (!res.ok) alert(await res.text());
    await load();
  }

  if (!canInvite) {
    return null; // Hide share button if user can't invite
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-2 rounded-xl border">Share</button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 p-4 shadow" onClick={(e)=>e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Share campaign</div>

            <div className="flex gap-2 mb-3">
              <input
                type="email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="flex-1 rounded-xl border px-3 py-2 text-sm"
              />
              <select value={role} onChange={(e)=>setRole(e.target.value as any)} className="rounded-xl border px-2">
                <option value="sender">Sender</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button disabled={!email || busy} onClick={addByEmail} className="px-3 py-2 rounded-xl border">
                {busy ? "Adding…" : "Add"}
              </button>
            </div>

            {inviteLink && (
              <div className="text-xs mb-3">
                Invite created — share this link:{" "}
                <a href={inviteLink} className="underline break-all">{inviteLink}</a>
              </div>
            )}

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-black/5 dark:bg-white/10">
                  <tr>
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Role</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.user_id} className="border-t">
                      <td className="p-2">{m.name || m.email || m.user_id}</td>
                      <td className="p-2">{m.role}</td>
                      <td className="p-2 text-right">
                        <button onClick={()=>remove(m.user_id)} className="text-red-600">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {members.length===0 && (
                    <tr><td className="p-2 opacity-60" colSpan={3}>No members yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-right">
              <button className="px-3 py-2 rounded-xl border" onClick={()=>setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

