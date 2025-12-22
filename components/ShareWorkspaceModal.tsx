"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function ShareWorkspaceModal({
  workspaceId,
  open,
  onClose
}: { workspaceId: string; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member"|"admin">("member");
  const [link, setLink] = useState<string>("");

  async function invite() {
    const res = await fetch("/api/workspaces/invite", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ workspaceId, email, role })
    });
    const j = await res.json();
    if (j.ok) setLink(j.link);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Share workspace</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <label className="text-sm">
          <div className="mb-1">Invite by email</div>
          <input className="w-full border rounded-md px-3 py-2 text-sm" value={email} onChange={e=>setEmail(e.target.value)} placeholder="teammate@company.com" />
        </label>
        <label className="text-sm">
          <div className="mb-1">Role</div>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={role} onChange={e=>setRole(e.target.value as any)}>
            <option value="member">Member (read, limited write)</option>
            <option value="admin">Admin (manage, write)</option>
          </select>
        </label>
        <button onClick={invite} className="w-full bg-black text-white rounded-md py-2 text-sm">Create invite link</button>
        {link && (
          <div className="text-xs bg-zinc-50 border rounded p-2 break-all">
            Share this link: <span className="font-mono">{link}</span>
          </div>
        )}
      </div>
    </div>
  );
}
