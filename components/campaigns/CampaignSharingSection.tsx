"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserPlus2, Trash2 } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select";

type CampaignMember = {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
};

type Props = {
  campaignId: string;
};

export function CampaignSharingSection({ campaignId }: Props) {
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "editor" | "viewer">("editor");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/members`);
    const json = await res.json();
    if (res.ok) {
      setMembers(json.members || []);
    } else {
      setError(json.error || "Failed to load members");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const addMember = async () => {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/members/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to add member");
    } else {
      setEmail("");
      await load();
    }
    setSaving(false);
  };

  const changeRole = async (memberId: string, newRole: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/members/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role: newRole }),
    });
    if (res.ok) {
      await load();
    }
  };

  const removeMember = async (memberId: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/members/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, remove: true }),
    });
    if (res.ok) {
      await load();
    }
  };

  const roleBadge = (r: string) => {
    const label =
      r === "owner" ? "Owner" : r === "editor" ? "Editor" : "Viewer";
    return (
      <Badge
        className={cn(
          "text-[10px] uppercase tracking-wide",
          r === "owner"
            ? "bg-amber-600"
            : r === "editor"
            ? "bg-emerald-600"
            : "bg-slate-600"
        )}
      >
        {label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Campaign sharing</span>
          <span className="text-[11px] text-muted-foreground">
            Share this campaign with teammates
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {/* Invite form */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex-1 min-w-[220px]">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Teammate email"
              className="h-8 text-xs"
            />
          </div>
          <Select
            value={role}
            onValueChange={(v) =>
              setRole(v as "owner" | "editor" | "viewer")
            }
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="flex items-center gap-1"
            disabled={saving || !email.trim()}
            onClick={addMember}
          >
            <UserPlus2 className="h-3 w-3" />
            <span className="text-xs">Share</span>
          </Button>
        </div>

        {error && (
          <div className="text-[11px] text-red-400">{error}</div>
        )}

        {/* Members list */}
        <div className="border-t border-slate-800 pt-2 mt-2">
          {loading ? (
            <div className="text-[11px] text-muted-foreground">
              Loading members…
            </div>
          ) : members.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              No members yet. Share this campaign with a teammate.
            </div>
          ) : (
            <div className="space-y-1">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-1"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">
                      {m.profiles?.full_name || m.profiles?.email || "User"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.profiles?.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {roleBadge(m.role)}
                    <Select
                      value={m.role}
                      onValueChange={(v) => changeRole(m.id, v)}
                    >
                      <SelectTrigger className="h-7 w-24 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeMember(m.id)}
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}







