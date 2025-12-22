"use client";

import * as React from "react";
import useSWR from "swr";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  role: "owner" | "editor" | "viewer";
  created_at: string;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((res) => res.json());

export function ShareCampaignModal({ campaignId }: { campaignId: string }) {
  const { data, mutate, isLoading } = useSWR<{ members: Member[] }>(
    campaignId ? `/api/campaign/${campaignId}/members` : null,
    fetcher
  );
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Member["role"]>("viewer");
  const [open, setOpen] = React.useState(false);
  const members = data?.members ?? [];

  async function invite() {
    if (!email) return;

    const res = await fetch(`/api/campaign/${campaignId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err =
        typeof payload?.error === "string" ? payload.error : Array.isArray(payload?.error) ? payload.error[0] : null;
      toast.error(err ?? "Invite failed");
      return;
    }

    toast.success(payload?.pending ? "Invite pending (user not found yet)" : "Member added");
    setEmail("");
    mutate();
  }

  async function changeRole(memberId: string, nextRole: Member["role"]) {
    const res = await fetch(`/api/campaign/${campaignId}/members`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member_id: memberId, role: nextRole }),
    });

    if (!res.ok) {
      toast.error("Failed to update role");
      return;
    }

    mutate();
  }

  async function remove(memberId: string) {
    const res = await fetch(`/api/campaign/${campaignId}/members`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member_id: memberId, remove: true }),
    });

    if (!res.ok) {
      toast.error("Failed to remove member");
      return;
    }

    mutate();
  }

  const isEmptyState = !isLoading && members.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="teammate@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Select value={role} onValueChange={(value) => setRole(value as Member["role"])}>
              <SelectTrigger className="sm:w-[130px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={invite} disabled={!email}>
              Invite
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="divide-y">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <div className="font-medium">
                      {member.email ?? (member.user_id === "00000000-0000-0000-0000-000000000000" ? "Pending invite" : member.user_id)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {member.email ? "email" : member.user_id === "00000000-0000-0000-0000-000000000000" ? "pending" : "member id"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <Select value={member.role} onValueChange={(value) => changeRole(member.id, value as Member["role"]) }>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => remove(member.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {isEmptyState && (
                <div className="p-4 text-sm text-muted-foreground">No members yet.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


