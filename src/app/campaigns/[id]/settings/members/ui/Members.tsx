"use client";

import * as React from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type Role = "viewer" | "editor" | "owner";

type Member = {
  user_id: string;
  role: Role;
  created_at: string;
};

export default function Members({ campaignId, currentUserId }: { campaignId: string; currentUserId: string }) {
  const { data, mutate } = useSWR<{ items: Member[] }>(
    `/api/campaigns/${campaignId}/members`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("editor");
  const members = data?.items ?? [];

  async function invite() {
    const res = await fetch("/functions/v1/campaign-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, email, role, invited_by: currentUserId }),
    });

    if (res.ok) {
      setEmail("");
      void mutate();
    }
  }

  async function changeRole(user_id: string, next: Role) {
    await fetch(`/api/campaigns/${campaignId}/members`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id, role: next }),
    });
    void mutate();
  }

  async function remove(user_id: string) {
    await fetch(`/api/campaigns/${campaignId}/members?user_id=${user_id}`, { method: "DELETE" });
    void mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="email@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-80"
        />
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">viewer</SelectItem>
            <SelectItem value="editor">editor</SelectItem>
            <SelectItem value="owner">owner</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={invite} disabled={!email}>
          Invite
        </Button>
      </div>

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between border rounded-md p-3">
            <div className="text-sm">
              <div className="font-medium">{m.user_id === currentUserId ? "You" : m.user_id}</div>
              <div className="text-xs text-muted-foreground">
                joined {new Date(m.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v as Role)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">viewer</SelectItem>
                  <SelectItem value="editor">editor</SelectItem>
                  <SelectItem value="owner">owner</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" onClick={() => remove(m.user_id)} disabled={m.user_id === currentUserId}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        {members.length === 0 && <p className="text-xs text-muted-foreground">No members yet.</p>}
      </div>
    </div>
  );
}
