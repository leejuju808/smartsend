"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

export function InviteDialog({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"viewer"|"editor"|"owner">("viewer");
  const [loading, setLoading] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);

  async function createInvite() {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/createInvite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sb-access-token")}` },
        body: JSON.stringify({ campaign_id: campaignId, email, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setInviteUrl(data.invite_url);
      toast({ title: "Invite created", description: "Share the link below with your teammate." });
    } catch (e: any) {
      toast({ title: "Invite failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Invite</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v:any)=>setRole(v)}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={createInvite} disabled={loading || !email}>{loading ? "Creating…" : "Create invite"}</Button>

          {inviteUrl ? (
            <div className="rounded-lg border p-3 text-sm">
              <div className="mb-1 font-medium">Invite link</div>
              <div className="break-all select-all">{inviteUrl}</div>
              <div className="text-xs text-muted-foreground mt-1">Share this with the teammate to accept.</div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}


