import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Get teams user belongs to via team_members join
  const { data: memberships, error } = await supabase
    .from("team_members")
    .select("team_id, teams(id, name, owner_id, created_at)")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const teams = (memberships || []).map((m: any) => ({
    id: m.teams.id,
    name: m.teams.name,
    owner_id: m.teams.owner_id,
    created_at: m.teams.created_at,
  }));

  return NextResponse.json({ ok: true, items: teams });
}

