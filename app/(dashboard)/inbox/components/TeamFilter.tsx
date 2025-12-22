"use client";

import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Team = {
  id: string;
  name: string;
};

export function TeamFilter({ onSelect }: { onSelect: (teamId: string | null) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTeams() {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const { data: { user } } = await sb.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Get user's teams
      const { data: members } = await sb
        .from("team_members")
        .select("team_id, teams:team_id(id, name)")
        .eq("user_id", user.id);

      if (members) {
        const uniqueTeams = members
          .map((m: any) => m.teams)
          .filter((t: any) => t !== null)
          .reduce((acc: Team[], team: any) => {
            if (!acc.find(t => t.id === team.id)) {
              acc.push({ id: team.id, name: team.name });
            }
            return acc;
          }, [] as Team[]);
        
        setTeams(uniqueTeams);
      }
      
      setLoading(false);
    }

    fetchTeams();
  }, []);

  if (loading) {
    return <div className="w-[200px] h-10 bg-muted animate-pulse rounded-md" />;
  }

  if (teams.length === 0) {
    return null;
  }

  return (
    <Select onValueChange={(value) => onSelect(value === "all" ? null : value)}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Filter by Team" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Teams</SelectItem>
        {teams.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

