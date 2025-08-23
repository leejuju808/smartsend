import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { data: prof } = await supabaseAdmin
    .from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.json({ error: "No team" }, { status: 400 });

  const teamId = prof.team_id;

  // replies per member
  const { data } = await supabaseAdmin.rpc("leaderboard_for_team", { tid: teamId });
  return NextResponse.json({ leaderboard: data || [] });
} 