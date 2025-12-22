"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { useRole } from "@/hooks/useRole";

function MakeOwnerButton({ campaignId, userId, disabled }:{
  campaignId:string; userId:string; disabled?:boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push: toast } = useToast();

  const transfer = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/campaign-members/transfer", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        credentials:"include",
        body: JSON.stringify({ campaign_id: campaignId, new_owner_user_id: userId })
      });
      
      if (res.ok) {
        toast({ title: "Ownership transferred", type: "success" });
        // Hard refresh recommended because permissions change for current user
        window.location.reload();
      } else {
        try {
          const err = await res.json();
          toast({ title: err.error || "Transfer failed", type: "error" });
        } catch {
          const msg = await res.text();
          toast({ title: msg || "Transfer failed", type: "error" });
        }
      }
    } catch (err: any) {
      toast({ title: err.message || "Transfer failed", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="h-8" disabled={disabled}>Make owner</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership?</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>This will make the selected teammate the <b>Owner</b>.</p>
          <p>You will be demoted to <b>Editor</b>. Only the new owner can undo this.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={transfer} disabled={busy}>
            {busy ? "Transferring..." : "Confirm transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignMembers({ campaignId }: { campaignId: string }) {
  const { data, mutate } = useSWR(
    `/api/campaigns/${campaignId}/members`,
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 15000 }
  );
  const rows = data?.members ?? [];
  const myRole = useRole(campaignId);
  const isOwner = myRole === "owner";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");

  const invite = async () => {
    if (!email.trim()) return;
    
    const res = await fetch(`/api/campaigns/${campaignId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, email, role }),
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to invite user");
      return;
    }
    
    setEmail("");
    setRole("viewer");
    mutate();
  };

  const changeRole = async (user_id: string, r: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/members`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, user_id, role: r }),
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to change role");
      return;
    }
    
    mutate();
  };

  const remove = async (user_id: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    
    const res = await fetch(`/api/campaigns/${campaignId}/members?user=${user_id}`, {
      method: "DELETE",
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to remove member");
      return;
    }
    
    mutate();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Team Access</div>
        <div className="text-xs text-muted-foreground">
          Viewer = read only · Editor = edit/send · Owner = full control
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_160px_100px] gap-2">
        <Input
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              invite();
            }
          }}
        />
        <Select value={role} onValueChange={(v: any) => setRole(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={invite} disabled={!email.trim()}>
          Invite
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Role</TH>
              <TH className="w-40">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r: any) => (
              <TR key={r.id || r.user_id}>
                <TD className="text-xs">
                  <div className="text-sm">
                    <div className="font-medium text-xs">{r.email ?? r.user_id}</div>
                    <div className="text-[11px] text-muted-foreground">{r.email ? "email" : "member id"}</div>
                  </div>
                </TD>
                <TD className="text-xs">
                  <span className="capitalize">{r.role}</span>
                </TD>
                <TD className="flex gap-2">
                  {r.role !== "owner" ? (
                    <>
                      <Select
                        value={r.role}
                        onValueChange={(v) => changeRole(r.user_id, v)}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue placeholder="Change role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => remove(r.user_id)}
                      >
                        Remove
                      </Button>
                      {isOwner && (
                        <MakeOwnerButton campaignId={campaignId} userId={r.user_id} />
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR>
                <TD colSpan={3} className="text-sm text-muted-foreground text-center">
                  No members yet.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

