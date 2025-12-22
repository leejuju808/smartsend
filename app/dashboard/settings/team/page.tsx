"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/Badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Users, UserPlus } from "lucide-react";
import { useSeatCheck } from "@/lib/hooks/useSeatCheck";

type Member = {
  user_id: string | null;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "member";
  created_at: string;
};

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<{ userId: string; role: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const { data: seatCheck, loading: seatCheckLoading, reload: reloadSeatCheck } = useSeatCheck();

  const load = async () => {
    const res = await fetch("/api/workspace/team/list");
    const json = await res.json();
    setMembers(json.members || []);
    setMe(json.me || null);
    await reloadSeatCheck();
  };

  useEffect(() => {
    load();
  }, []);

  const canManage = me && ["owner", "admin"].includes(me.role);

  const seatsUsed = seatCheck?.seats_used ?? 0;
  const seatLimit = seatCheck?.seat_limit ?? null;
  const canAdd = seatCheck?.can_add_member ?? true;

  const seatsText =
    seatLimit && seatLimit > 0
      ? `${seatsUsed} / ${seatLimit}`
      : `${seatsUsed}`;

  const showWarning = !seatCheckLoading && seatCheck && !canAdd && seatLimit !== null;

  const invite = async () => {
    if (!inviteEmail) return;
    if (!canAdd) {
      setInviteError("Seat limit reached. Upgrade your plan to add more teammates.");
      return;
    }
    setLoading(true);
    setInviteError(null);
    const res = await fetch("/api/workspace/team/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const json = await res.json();
    if (!res.ok) {
      setInviteError(json.error?.message || json.error || "Failed to invite.");
    } else {
      setInviteEmail("");
      await load();
    }
    setLoading(false);
  };

  const changeRole = async (userId: string | null, role: string) => {
    if (!userId) return; // skip pending invites with null user_id
    await fetch(`/api/workspace/team/${userId}/role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });
    await load();
  };

  const remove = async (userId: string | null) => {
    if (!userId) return;
    await fetch(`/api/workspace/team/${userId}/remove`, {
      method: "POST",
    });
    await load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team & Seats
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage team members and seat usage for this workspace.
          </p>
        </div>
      </div>

      {/* ⚠️ Seat limit banner */}
      {showWarning && (
        <Card className="border-amber-800 bg-amber-950/40">
          <CardContent className="p-3 flex items-start gap-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-amber-100">
                  Seat limit reached — you can&apos;t invite more teammates on this plan.
                </span>
                <Badge className="bg-amber-900/80 border-amber-600 text-[10px]">
                  Seats full
                </Badge>
              </div>
              <p className="text-[11px] text-amber-100/80 mt-1">
                Current usage: {seatsText}. Upgrade your plan to add more seats to this workspace.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seat usage card + Invite button */}
      <Card className="bg-slate-950/80 border-slate-800">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Seats
          </CardTitle>
          {seatLimit && seatLimit > 0 && (
            <Badge className="bg-slate-900/80 border-slate-600 text-[10px]">
              Limit: {seatLimit}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-3 flex items-center justify-between text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-semibold">
              {seatCheckLoading ? "…" : seatsText}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Each active team member in this workspace counts as one seat.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invite teammate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="md:flex-1"
              disabled={!canManage || !canAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading && inviteEmail && canAdd) {
                  invite();
                }
              }}
            />
            <Button 
              onClick={invite} 
              disabled={!canManage || loading || !canAdd || seatCheckLoading}
              className="inline-flex items-center gap-1"
            >
              <UserPlus className="h-3 w-3" />
              {loading ? "Inviting..." : "Invite"}
            </Button>
          </div>
          {inviteError && (
            <p className="text-xs text-red-500">{inviteError}</p>
          )}
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              Only workspace owners and admins can invite teammates.
            </p>
          )}
          {canManage && !canAdd && (
            <p className="text-xs text-amber-500">
              Seat limit reached. Upgrade your plan to invite more teammates.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Team members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => {
            const isMe = me && m.user_id === me.userId;
            return (
              <div
                key={`${m.email}-${m.user_id || "pending"}`}
                className="flex items-center justify-between border rounded px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {m.name || m.email}
                    {isMe && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.email}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onValueChange={(v) => changeRole(m.user_id, v)}
                    disabled={!canManage || isMe}
                  >
                    <SelectTrigger className="h-8 w-[120px] text-xs" disabled={!canManage || isMe}>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>

                  {canManage && !isMe && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(m.user_id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No team members yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

