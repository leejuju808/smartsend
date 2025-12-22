"use client";

import { useState, useEffect } from "react";
import { inviteTeamMember } from "@/actions/inviteTeamMember";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { createBrowserClient } from "@supabase/ssr";

type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type Team = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export function TeamSettingsClient({ team, initialMembers }: { team: Team; initialMembers: TeamMember[] }) {
  const [members, setMembers] = useState<Array<TeamMember & { email?: string }>>(initialMembers);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch user emails - simplified for MVP
  useEffect(() => {
    async function fetchEmails() {
      const emails: Record<string, string> = {};
      for (const member of members) {
        try {
          // Try to get email from profiles table if it exists
          const { data: profile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", member.user_id)
            .maybeSingle();
          
          if (profile?.email) {
            emails[member.user_id] = profile.email;
          } else {
            // For MVP, show truncated user_id if email not available
            emails[member.user_id] = member.user_id.substring(0, 8) + "...";
          }
        } catch (e) {
          emails[member.user_id] = member.user_id.substring(0, 8) + "...";
        }
      }
      setUserEmails(emails);
    }
    if (members.length > 0) {
      fetchEmails();
    }
  }, [members, supabase]);

  async function handleInvite() {
    if (!email.trim()) return;
    try {
      setLoading(true);
      await inviteTeamMember(email.trim(), "member");
      // Refresh members list
      const { data: newMembers } = await supabase
        .from("smartsend_team_members")
        .select("*")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false });
      if (newMembers) {
        setMembers(newMembers);
        setEmail("");
      }
    } catch (error: any) {
      alert(error.message || "Failed to invite member");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Team Settings</h1>
        <p className="text-sm text-muted-foreground">
          Team: {team.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite teammate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="flex-1"
            />
            <Button size="sm" onClick={handleInvite} disabled={loading || !email.trim()}>
              {loading ? "Inviting..." : "Invite"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between border-b last:border-b-0 pb-2 pt-2"
                >
                  <span>{userEmails[m.user_id] || m.user_id.substring(0, 8) + "..."}</span>
                  <span className="text-xs uppercase text-muted-foreground">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

