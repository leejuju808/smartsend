"use client";

import * as React from "react";

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Error");
  }
  return json;
}

async function patchJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Error");
  }
  return json;
}

export function ShareDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<any[]>([]);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("editor");
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/members`);
    const json = await res.json();
    if (json.ok) {
      setMembers(json.members || []);
    }
  }, [campaignId]);

  React.useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  const invite = React.useCallback(async () => {
    setLoading(true);
    try {
      const json = await postJSON("/api/share/invite", {
        email,
        scope: "campaign",
        campaignId,
        role,
      });
      setToken(json.token);
      setEmail("");
      await load();
    } finally {
      setLoading(false);
    }
  }, [campaignId, email, load, role]);

  const setRoleFor = React.useCallback(
    async (userId: string, newRole: string) => {
      await patchJSON(`/api/campaigns/${campaignId}/members`, { userId, role: newRole });
      await load();
    },
    [campaignId, load],
  );

  const remove = React.useCallback(
    async (userId: string) => {
      const res = await fetch(`/api/campaigns/${campaignId}/members?userId=${userId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) {
        alert(json.error || "Failed");
      } else {
        load();
      }
    },
    [campaignId, load],
  );

  return (
    <>
      <button className="h-8 px-3 rounded-md border" onClick={() => setOpen(true)}>
        Share
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="w-full max-w-lg rounded-2xl bg-white text-black p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Share Campaign</h3>
              <button onClick={() => setOpen(false)} className="text-sm">
                Close
              </button>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium">Invite by email</div>
              <div className="flex gap-2">
                <input
                  className="flex-1 h-9 border rounded px-2 text-sm"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <select
                  className="h-9 border rounded px-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {["owner", "admin", "editor", "viewer"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  className="h-9 px-3 rounded bg-zinc-900 text-white disabled:opacity-50"
                  onClick={invite}
                  disabled={loading || !email}
                >
                  Invite
                </button>
              </div>
              {token && (
                <div className="text-xs mt-1">
                  Invite token (dev):{" "}
                  <code className="px-1 py-0.5 bg-zinc-100 rounded">{token}</code>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Members</div>
              <div className="space-y-2">
                {members.map((m: any) => (
                  <div key={m.user_id} className="flex items-center gap-2">
                    <div className="flex-1 text-sm">{m.profiles?.email || m.user_id}</div>
                    <select
                      className="h-8 border rounded px-2 text-sm"
                      value={m.role}
                      onChange={(e) => setRoleFor(m.user_id, e.target.value)}
                    >
                      {["owner", "admin", "editor", "viewer"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      className="h-8 px-3 rounded border text-sm"
                      onClick={() => remove(m.user_id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="text-sm text-zinc-500">No members yet.</div>
                )}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Permissions: Owner/Admin (manage & delete), Editor (edit content, send), Viewer
              (read-only).
            </div>
          </div>
        </div>
      )}
    </>
  );
}




