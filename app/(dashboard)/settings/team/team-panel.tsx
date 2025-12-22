"use client";
import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { toast } from "sonner";

export default function TeamPanel({ teamId, members, invites }: {
  teamId: string;
  members: any[];
  invites: any[];
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("viewer");
  const [pending, setPending] = React.useState(false);

  async function invite() {
    if (!email) return;
    setPending(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, team_id: teamId })
      });
      const json = await res.json();
      if (!res.ok) { 
        toast.error(json.error || "Invite failed"); 
        return; 
      }
      toast.success("Invite sent successfully.");
      setEmail("");
      // Refresh page to show new invite
      setTimeout(() => location.reload(), 1000);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Email to invite..." 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            className="flex-1"
          />
          <select 
            value={role} 
            onChange={(e) => setRole(e.target.value)} 
            className="border rounded-md px-2 bg-background"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <Button onClick={invite} disabled={pending || !email}>
            Invite
          </Button>
        </div>

        {invites.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Pending invites ({invites.length}): {invites.map(i => i.email).join(", ")}
          </div>
        )}

        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-2">Current Members</div>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between p-2 rounded border">
                <div>
                  <div className="text-sm font-medium">
                    {m.profiles?.full_name || m.profiles?.email || m.user_id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.profiles?.email || ""} • {m.role}
                  </div>
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No members yet.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


