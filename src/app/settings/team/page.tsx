"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast/ToastProvider";

function useSB() {
  return useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );
}

type TeamMember = {
  user_id: string;
  user_email: string;
  role: "owner" | "editor" | "viewer";
  active: boolean;
  created_at: string;
  removed_at: string | null;
};

export default function TeamPage() {
  const sb = useSB();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
const [accountId, setAccountId] = useState<string | null>(null);
const [seats, setSeats] = useState<{ active_seats: number; seats: number | null }>({ active_seats: 0, seats: null });
type BillingStatus = {
  plan_seat_limit: number | null;
  seats_used: number;
  seats_over: number;
  enforcement_mode: "hard" | "soft";
  subscription_status: string;
};
const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const { push: pushToast } = useToast();

  useEffect(() => {
    (async () => {
      const { data: s } = await sb.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) return;
      setOwnerId(uid);

      const { data: profile } = await sb
        .from("profiles")
        .select("account_id")
        .eq("id", uid)
        .maybeSingle();

      const acctId = profile?.account_id ?? null;
      setAccountId(acctId);

      await refreshBilling(acctId, uid);

      const { data: team } = await sb
        .from("v_team_members")
        .select("user_id,user_email,role,active,created_at,removed_at")
        .eq("owner_user_id", uid);

      const dedup = Object.values(
        (team || []).reduce<Record<string, TeamMember>>((acc, r) => {
          if (!acc[r.user_id] || new Date(r.created_at) > new Date(acc[r.user_id].created_at)) {
            acc[r.user_id] = r as TeamMember;
          }
          return acc;
        }, {}),
      ) as TeamMember[];

      setMembers(dedup);
    })();
  }, [sb]);

  async function refreshBilling(acctId: string | null, ownerUid: string | null = ownerId) {
    if (!acctId) {
      setBillingStatus(null);
      setSeats({ active_seats: 0, seats: null });
      return;
    }

    const { data: billing } = await sb
      .from("account_billing_status")
      .select("plan_seat_limit,seats_used,seats_over,enforcement_mode,subscription_status")
      .eq("account_id", acctId)
      .maybeSingle();

    if (billing) {
      const normalized: BillingStatus = {
        plan_seat_limit: billing.plan_seat_limit,
        seats_used: billing.seats_used,
        seats_over: billing.seats_over,
        enforcement_mode: billing.enforcement_mode as BillingStatus["enforcement_mode"],
        subscription_status: billing.subscription_status,
      };
      setBillingStatus(normalized);
      setSeats({
        active_seats: billing.seats_used,
        seats: billing.plan_seat_limit,
      });
    } else {
      setBillingStatus(null);
      const { data: seatRows } = await sb
        .from("v_team_seat_counts")
        .select("active_seats, seats")
        .eq("owner_user_id", ownerUid ?? ownerId ?? "")
        .limit(1);
      setSeats(seatRows?.[0] ?? { active_seats: 0, seats: null });
    }
  }

  const limitReached =
    !!billingStatus &&
    billingStatus.enforcement_mode === "hard" &&
    billingStatus.plan_seat_limit !== null &&
    billingStatus.seats_used >= billingStatus.plan_seat_limit;

  async function sendInvite() {
    if (!ownerId || !email) return;
    if (limitReached) {
      pushToast({
        type: "error",
        title: "Seat limit reached",
        description: "Remove a member or upgrade your plan before inviting more teammates.",
      });
      return;
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/team-invite-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_user_id: ownerId, email, role }),
    });
    const j = await res.json();
    if (j.ok) {
      setInviteLink(j.link as string);
      setEmail("");
      await refreshBilling(accountId, ownerId);
    } else {
      pushToast({ type: "error", title: "Invite failed", description: j.error || "Unable to generate invite link." });
    }
  }

  async function changeRole(userId: string, newRole: "editor" | "viewer") {
    if (!ownerId) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/team-member-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_user_id: ownerId, member_user_id: userId, role: newRole }),
    });
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
    await refreshBilling(accountId, ownerId);
  }

  async function removeMember(userId: string) {
    if (!ownerId) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/team-member-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_user_id: ownerId, member_user_id: userId, active: false }),
    });
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === userId
          ? { ...m, active: false, removed_at: new Date().toISOString() }
          : m,
      ),
    );
    await refreshBilling(accountId, ownerId);
  }

  return (
    <div className="p-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Invite Teammate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Seats: <b>{seats?.active_seats ?? 0}</b>{" "}
            /
            {" "}
            {seats?.seats === null ? "∞" : (seats?.seats ?? 0)}
          </div>
          {billingStatus?.seats_over > 0 && (
            <div className="rounded-lg border border-amber-500 bg-amber-50 text-amber-900 p-3 text-sm">
              You&apos;re over your seat limit by {billingStatus.seats_over}. Upgrade your plan or remove members.
            </div>
          )}
          {billingStatus?.subscription_status === "past_due" && (
            <div className="rounded-lg border border-red-500 bg-red-50 text-red-900 p-3 text-sm">
              Your subscription is past due. Update your payment method in Billing to restore access.
            </div>
          )}
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Select value={role} onValueChange={(v) => setRole(v as "editor" | "viewer")}>
              <SelectTrigger className="w-full md:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={sendInvite} disabled={limitReached}>
              {limitReached ? "Seat limit reached" : "Generate Link"}
            </Button>
          </div>
          {inviteLink ? (
            <div className="text-xs">
              Share this link with your teammate:{" "}
              <a className="underline" href={inviteLink} target="_blank" rel="noreferrer">
                {inviteLink}
              </a>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.length === 0 ? (
            <div className="text-sm text-muted-foreground">No teammates yet.</div>
          ) : (
            members.map((m) => (
              <div key={m.user_id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{m.user_email}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.active
                      ? "Active"
                      : `Removed ${m.removed_at ? new Date(m.removed_at).toLocaleString() : ""}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{m.role}</Badge>
                  {(m.role === "editor" || m.role === "viewer") && (
                    <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v as "editor" | "viewer")}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeMember(m.user_id)}
                    disabled={!m.active || m.role === "owner"}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
