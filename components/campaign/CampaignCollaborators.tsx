"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Collaborator = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  role: "viewer" | "editor";
};

export function CampaignCollaborators({ campaignId }: { campaignId: string }) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/collaborators`);
      const json = await res.json();
      setCollaborators(json.collaborators || []);
    };
    load();
  }, [campaignId]);

  const remove = async (id: string) => {
    setError(null);
    const res = await fetch(
      `/api/campaigns/${campaignId}/collaborators/${id}`,
      {
        method: "DELETE",
      }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error?.message || "Failed to remove collaborator.");
      return;
    }
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  };

  const add = async () => {
    if (!inviteEmail) return;
    setLoading(true);
    setError(null);

    try {
      // Lookup team member by email and workspace on the server
      const lookupRes = await fetch(`/api/team/lookup-by-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: inviteEmail, campaignId }),
      });
      const lookupJson = await lookupRes.json();

      if (!lookupRes.ok || !lookupJson.userId) {
        setError(
          lookupJson.error ||
            "Could not find a team member with that email in this workspace."
        );
        setLoading(false);
        return;
      }

      // Add as collaborator
      const addRes = await fetch(
        `/api/campaigns/${campaignId}/collaborators`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: lookupJson.userId, role: inviteRole }),
        }
      );
      if (!addRes.ok) {
        const j = await addRes.json().catch(() => ({}));
        setError(j.error?.message || "Failed to add collaborator.");
        setLoading(false);
        return;
      }

      setInviteEmail("");
      setInviteRole("viewer");

      // Reload collaborators
      const list = await fetch(`/api/campaigns/${campaignId}/collaborators`);
      const json = await list.json();
      setCollaborators(json.collaborators || []);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared With</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-red-500 border border-red-500/40 rounded px-2 py-1">
            {error}
          </p>
        )}

        <div className="space-y-2">
          {collaborators.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Only you have access to this campaign right now.
            </p>
          )}

          {collaborators.length > 0 && (
            <ul className="space-y-2">
              {collaborators.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between text-sm border rounded px-3 py-2"
                >
                  <div>
                    <div className="font-medium">
                      {c.user_name || c.user_email || "Unknown user"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.user_email}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-wide rounded px-2 py-1 bg-muted">
                      {c.role}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => remove(c.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Invite teammate</p>
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="md:flex-1"
            />
            <Select
              value={inviteRole}
              onValueChange={(v: "viewer" | "editor") => setInviteRole(v)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={add} disabled={loading}>
              {loading ? "Adding..." : "Add"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Only team members in this workspace can be added.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}








