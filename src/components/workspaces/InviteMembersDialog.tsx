"use client";
import { useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus } from "lucide-react";

export default function InviteMembersDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer"|"editor"|"admin">("editor");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const onInvite = async () => {
    setLoading(true); 
    setLink(null);
    
    try {
      const res = await fetch(`/api/workspaces/invite`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      
      const j = await res.json();
      
      if (!res.ok) {
        alert(j.error || "Invite failed");
        return;
      }
      
      setLink(j.link);
    } catch (error) {
      console.error("Error creating invite:", error);
      alert("Failed to create invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="teammate@company.com" 
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={onInvite} disabled={loading || !email}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create invite link
            </Button>
          </div>
          {link && (
            <div className="rounded-md border p-2 text-sm">
              Share this link: <a className="underline" href={link}>{link}</a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}