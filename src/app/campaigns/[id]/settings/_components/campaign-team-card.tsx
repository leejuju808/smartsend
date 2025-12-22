"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { UserPlus, Trash2 } from "lucide-react";

type Role = "owner" | "editor" | "viewer";

interface MemberRow {
  user_id: string;
  role: Role;
  created_at: string;
  profile?: {
    id: string;
    email: string;
    full_name?: string | null;
  } | null;
}

interface Props {
  campaignId: string;
  ownerUserId: string;
  currentUserId: string;
  members: MemberRow[];
}

export function CampaignTeamCard({
  campaignId,
  ownerUserId,
  currentUserId,
  members,
}: Props) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<Role>("editor");
  const [loadingInvite, setLoadingInvite] = React.useState(false);
  const [loadingRemoveId, setLoadingRemoveId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isOwner = currentUserId === ownerUserId;

  const handleInvite = async () => {
    setError(null);
    if (!inviteEmail.trim()) {
      setError("Email is required.");
      return;
    }
    setLoadingInvite(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error || "Failed to add member.");
        return;
      }

      setInviteEmail("");
      router.refresh();
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    setLoadingRemoveId(userId);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/members/${userId}`,
        {
          method: "DELETE",
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Failed to remove member.");
        return;
      }
      router.refresh();
    } finally {
      setLoadingRemoveId(null);
    }
  };

  const roleBadge = (role: Role) => {
    switch (role) {
      case "owner":
        return (
          <Badge variant="default" className="text-[10px] uppercase">
            Owner
          </Badge>
        );
      case "editor":
        return (
          <Badge variant="secondary" className="text-[10px] uppercase">
            Editor
          </Badge>
        );
      case "viewer":
        return (
          <Badge variant="outline" className="text-[10px] uppercase">
            Viewer
          </Badge>
        );
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Team &amp; Sharing
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Share this campaign with teammates and control who can edit or
              send.
            </p>
          </div>
        </div>

        {/* Members table */}
        <div className="rounded-xl border bg-background">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Role</TH>
                <TH className="text-right">Joined</TH>
                <TH className="text-right w-16">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {members.length === 0 ? (
                <TR>
                  <TD colSpan={4} className="py-4 text-sm text-center">
                    No members yet. You are the owner of this campaign.
                  </TD>
                </TR>
              ) : (
                members.map((m) => {
                  const email =
                    m.profile?.email ?? "(unknown email)";
                  const name =
                    (m.profile?.full_name as string | null) ?? null;
                  const joined = new Date(m.created_at).toLocaleDateString();

                  const removable =
                    isOwner && m.user_id !== ownerUserId; // can't remove owner

                  return (
                    <TR key={m.user_id}>
                      <TD>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {name || email}
                          </span>
                          {name && (
                            <span className="text-xs text-muted-foreground">
                              {email}
                            </span>
                          )}
                          {m.user_id === currentUserId && (
                            <span className="text-[10px] text-muted-foreground">
                              You
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD>{roleBadge(m.role)}</TD>
                      <TD className="text-right text-xs text-muted-foreground">
                        {joined}
                      </TD>
                      <TD className="text-right">
                        {removable ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => handleRemove(m.user_id)}
                            disabled={loadingRemoveId === m.user_id}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {m.role === "owner" ? "Owner" : ""}
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>

        {/* Invite form */}
        {isOwner ? (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">
              Add teammate
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="email"
                placeholder="teammate@company.com"
                className="max-w-xs"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-xs"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button
                type="button"
                size="sm"
                onClick={handleInvite}
                disabled={loadingInvite}
                className="flex items-center gap-1 text-sm"
              >
                <UserPlus className="h-3 w-3" />
                {loadingInvite ? "Adding…" : "Add"}
              </Button>
            </div>
            {error && (
              <p className="text-xs text-destructive whitespace-pre-line">
                {error}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Teammates must already have a SmartSend account using that email.
              In a later version we&apos;ll send invite emails automatically.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground pt-2 border-t">
            Only the campaign owner can modify team members for this campaign.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

