"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type InviteRole = "owner" | "editor" | "viewer";

type ShareData = {
  members: Array<{ user_id: string; role: InviteRole; email: string | null }>;
  invites: Array<{ id: string; email: string; role: InviteRole; created_at: string; expires_at: string; accepted_at: string | null }>;
};

export function ShareCampaignButton({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<InviteRole>("editor");
  const [rows, setRows] = React.useState<ShareData | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function refresh() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invites`);
      if (response.ok) {
        const payload = (await response.json()) as ShareData;
        setRows(payload);
      }
    } catch (error) {
      console.error("Failed to load sharing data", error);
    }
  }

  React.useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open]);

  async function invite() {
    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to send invite");
      }

      const data = await response.json();
      toast.success("Invite created");
      if (data?.link) {
        toast.message("Invite Link", {
          description: data.link,
        });
      }
      setEmail("");
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={invite} disabled={!email || loading}>
              {loading ? "Sending…" : "Send Invite"}
            </Button>
          </div>

          <hr className="my-2" />

          <div className="space-y-2">
            <div className="font-medium">Members</div>
            <ul className="space-y-1">
              {(rows?.members ?? []).map((member) => (
                <li key={member.user_id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                  <span>{member.email ?? member.user_id}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{member.role}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <div className="font-medium">Invites</div>
            <ul className="space-y-1">
              {(rows?.invites ?? []).map((invite) => (
                <li key={invite.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                  <span>{invite.email}</span>
                  <span className="opacity-70">{invite.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}







