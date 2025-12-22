"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export function InviteDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor" | "owner">("viewer");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendInvite() {
    setLoading(true);
    setMsg(null);
    const r = await fetch("/functions/v1/campaign-invite-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, email, role }),
    });
    setLoading(false);
    if (r.ok) {
      setMsg("Invite sent ✅");
      setEmail("");
    } else {
      setMsg("Failed to send invite");
    }
  }

  return (
    <div>
      <Button size="sm" onClick={() => setOpen(true)}>
        Share
      </Button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-4 space-y-3">
            <div className="text-sm font-medium">Invite collaborator</div>
            <Input placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "viewer" | "editor" | "owner")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={sendInvite} disabled={loading || !email}>
                Send Invite
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
            </div>
            <div className="text-xs text-muted-foreground">
              People with <b>Editor</b> can manage campaigns & replies; <b>Viewer</b> can read inbox only.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

