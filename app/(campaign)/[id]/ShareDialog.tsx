"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type ShareDialogProps = {
  accountId: string;
  campaignId: string;
};

export default function ShareDialog({ accountId, campaignId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [loading, setLoading] = useState(false);

  const invite = async () => {
    if (!email) {
      toast.error("Email is required");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, campaignId, email, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invite failed");
      }

      toast.success("Invite sent");
      setEmail("");
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invite failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Share
      </Button>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Share campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div>
            <div className="mb-1 text-xs">Role</div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (read only)</SelectItem>
                <SelectItem value="editor">Editor (send & edit)</SelectItem>
                <SelectItem value="admin">Admin (manage campaign)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={invite} disabled={loading || !email}>
            {loading ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




