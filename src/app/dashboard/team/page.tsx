"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Member = { user_id: string; role: "owner" | "admin" | "member"; profiles: { email: string } };
type Team = { id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; seat_count: number | null; seat_limit: number | null };

export default function TeamPage() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const seatsUsed = team?.seat_count ?? members.length;
  const seatLimit = team?.seat_limit ?? null;

  useEffect(() => {
    void initializeTeam();
  }, []);

  async function initializeTeam() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setInitialLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.team_id) {
        setTeamId(profile.team_id);
        await refresh(profile.team_id);
      }
    } catch (error) {
      console.error("Error initializing team:", error);
    } finally {
      setInitialLoading(false);
    }
  }

  async function refresh(teamIdToRefresh?: string) {
    const id = teamIdToRefresh || teamId;
    if (!id) return;

    const [{ data: roster }, { data: t }] = await Promise.all([
      supabase.from("team_members").select("user_id, role, profiles(email)").eq("team_id", id),
      supabase.from("teams").select("id, stripe_customer_id, stripe_subscription_id, seat_count, seat_limit").eq("id", id).single()
    ]);
    setMembers((roster as any[]) || []);
    setTeam((t as any) || null);
  }

  async function invite() {
    if (!teamId) return;
    setLoading(true);
    try {
      await fetch("/functions/v1/inviteTeamMember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, teamId }),
      });
      setEmail("");
      await refresh();
      // push seat sync
      await fetch("/functions/v1/stripeSeatSync", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }) 
      });
    } catch (error) {
      console.error("Error inviting member:", error);
      alert("Failed to invite member");
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(userId: string, role: "admin" | "member") {
    if (!teamId) return;
    setLoading(true);
    try {
      await supabase.from("team_members").update({ role }).match({ team_id: teamId, user_id: userId });
      await refresh();
    } catch (error) {
      console.error("Error changing role:", error);
      alert("Failed to change role");
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(userId: string) {
    if (!teamId) return;
    setLoading(true);
    try {
      await fetch("/functions/v1/removeTeamMember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, userId }),
      });
      await refresh();
      await fetch("/functions/v1/stripeSeatSync", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }) 
      });
    } catch (error) {
      console.error("Error removing member:", error);
      alert("Failed to remove member");
    } finally {
      setLoading(false);
    }
  }

  async function openBillingPortal() {
    if (!team?.stripe_customer_id) return;
    try {
      const ret = await fetch("/functions/v1/createBillingPortal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: team.stripe_customer_id,
          returnUrl: `${window.location.origin}/dashboard/team`,
        }),
      }).then(r => r.json());
      if (ret?.url) window.location.href = ret.url;
    } catch (error) {
      console.error("Error opening billing portal:", error);
      alert("Failed to open billing portal");
    }
  }

  const canAdd = seatLimit ? seatsUsed < seatLimit : true;

  if (initialLoading) {
    return (
      <div className="p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Team</h1>
        <p className="text-gray-600">You need to be part of a team. Contact your team owner for an invitation.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team Settings</h1>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <div>Seats: <strong>{seatsUsed}</strong>{seatLimit ? ` / ${seatLimit}` : ""}</div>
          </div>
          <Button variant="secondary" onClick={openBillingPortal} disabled={!team?.stripe_customer_id}>
            Manage Billing
          </Button>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Invite Member</h2>
        <div className="flex gap-2 max-w-lg">
          <Input placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={invite} disabled={loading || !canAdd}>{loading ? "Inviting..." : "Invite"}</Button>
        </div>
        {!canAdd && <p className="text-sm text-red-500">Seat limit reached. Upgrade in Billing to add more seats.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Members</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">{m.profiles?.email}</div>
                <div className="text-xs text-gray-500">{m.user_id}</div>
              </div>
              <div className="flex items-center gap-3">
                <Select
                  value={m.role}
                  onValueChange={(val) => val !== "owner" && changeRole(m.user_id, val as any)}
                  disabled={m.role === "owner" || loading}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">owner</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="member">member</SelectItem>
                  </SelectContent>
                </Select>
                {m.role !== "owner" && (
                  <Button variant="destructive" onClick={() => removeMember(m.user_id)} disabled={loading}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
