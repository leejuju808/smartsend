"use client";
import { useEffect, useState } from "react";

type ShareMember = {
  user_id: string;
  role: "viewer" | "editor" | "owner";
  profile?: { full_name?: string | null; email?: string | null } | null;
};

export function ShareDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ShareMember[]>([]);
  const [owner, setOwner] = useState<ShareMember | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch(`/api/campaigns/${campaignId}/shares`);
    const j = await res.json();
    if (res.ok) {
      setOwner(j.owner);
      setMembers(j.members || []);
    }
  }

  useEffect(() => { if (open) load(); }, [open, campaignId]);

  async function addShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === 'seat_limit_reached' || j.error?.includes('seat_limit')) {
          alert(`Seat limit reached (used ${j.seats_used || '?'} of ${j.seat_limit || '?'}). Upgrade to add more collaborators.`);
        } else {
          throw new Error(j.error || "Failed");
        }
        return;
      }
      setEmail("");
      await load();
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(userId: string, newRole: "viewer" | "editor") {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/shares/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      await load();
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function removeShare(userId: string) {
    if (!confirm("Remove access?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/shares/${userId}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      await load();
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  }

  function line(item: ShareMember) {
    const name = item.profile?.full_name || "(no name)";
    const email = item.profile?.email || "";
    return (
      <div key={item.user_id} className="flex items-center justify-between border rounded-lg px-3 py-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground truncate">{email}</div>
        </div>
        <div className="flex items-center gap-2">
          {item.role === "owner" ? (
            <span className="text-xs border rounded px-2 py-1">owner</span>
          ) : (
            <>
              <select
                className="text-xs border rounded px-2 py-1"
                disabled={loading}
                value={item.role}
                onChange={(e) => updateRole(item.user_id, e.target.value as "viewer" | "editor")}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
              </select>
              <button
                className="text-xs border rounded px-2 py-1 hover:bg-muted"
                disabled={loading}
                onClick={() => removeShare(item.user_id)}
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        className="text-sm border rounded-md px-2 py-1 hover:bg-muted"
        onClick={() => setOpen(true)}
      >
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-xl rounded-xl bg-background border p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Share Campaign</h3>
              <button className="text-sm opacity-80 hover:opacity-100" onClick={() => setOpen(false)}>Close</button>
            </div>

            {/* Owner */}
            {owner && (
              <div className="mb-3">
                <div className="text-xs mb-1 opacity-70">Owner</div>
                {line(owner)}
              </div>
            )}

            {/* Members */}
            <div className="mb-4">
              <div className="text-xs mb-1 opacity-70">Members</div>
              <div className="grid gap-2">
                {members.length === 0 && <div className="text-sm text-muted-foreground">No members yet.</div>}
                {members.map(line)}
              </div>
            </div>

            {/* Add */}
            <div className="border-t pt-3">
              <div className="text-xs mb-2 opacity-70">Invite by email (must already have an account)</div>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={role}
                  onChange={e => setRole(e.target.value as "viewer" | "editor")}
                >
                  <option value="viewer">viewer</option>
                  <option value="editor">editor</option>
                </select>
                <button
                  className="text-sm border rounded px-3 py-1 hover:bg-muted disabled:opacity-50"
                  disabled={loading || !email}
                  onClick={addShare}
                >
                  Add
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
