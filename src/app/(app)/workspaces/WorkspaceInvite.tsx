"use client";
import { useState } from "react";
import { inviteMember } from "./actions";

export default function WorkspaceInvite({ workspaceId, inviterEmail }: { workspaceId: string; inviterEmail?: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin"|"editor"|"viewer">("editor");
  const [msg, setMsg] = useState("");

  async function onInvite() {
    setMsg("");
    try {
      await inviteMember(workspaceId, email, role);
      setMsg("Invite sent.");
      setEmail("");
    } catch (e:any) {
      setMsg(e.message || "Error");
    }
  }

  return (
    <div className="p-4 rounded-2xl border space-y-3">
      <div className="font-semibold">Invite teammate</div>
      <input className="w-full bg-black/40 border p-2 rounded" placeholder="teammate@company.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
      <select className="w-full bg-black/40 border p-2 rounded" value={role} onChange={(e)=>setRole(e.target.value as any)}>
        <option value="admin">Admin (manage members)</option>
        <option value="editor">Editor (send & edit)</option>
        <option value="viewer">Viewer (read-only)</option>
      </select>
      <button onClick={onInvite} className="px-4 py-2 rounded bg-yellow-400 text-black font-semibold">Send Invite</button>
      {msg && <div className="text-sm text-gray-300">{msg}</div>}
    </div>
  );
}