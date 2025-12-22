"use client";

import * as React from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Member = {
  id: string;
  user_id: string;
  role: "viewer" | "editor" | "owner";
  created_at: string;
  user?: {
    email: string;
  } | null;
};

type User = {
  id: string;
  email: string;
};

export function CampaignMembersPanel({ campaignId, users }: { campaignId: string; users: User[] }) {
  const { data, mutate } = useSWR(`/api/campaigns/${campaignId}/members`, fetcher);

  const members = data?.members ?? [];

  async function addMember(userId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/members/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, role: "editor" }),
    });

    if (res.ok) {
      mutate();
    }
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/members/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });

    if (res.ok) {
      mutate();
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-bold">Team Members</h2>

      {members.map((m: Member) => (
        <div key={m.id} className="flex justify-between bg-muted p-3 rounded">
          <span>{m.user?.email ?? m.user_id}</span>
          <Button variant="outline" onClick={() => removeMember(m.user_id)}>
            Remove
          </Button>
        </div>
      ))}

      <Select onValueChange={addMember}>
        <SelectTrigger>
          <SelectValue placeholder="Add Teammate" />
        </SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}










