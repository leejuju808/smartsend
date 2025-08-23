import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function GET(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { data: me } = await supabaseAdmin
    .from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
  if (!me) return NextResponse.json({ error: "Not on a team" }, { status: 403 });

  const { data: domains } = await supabaseAdmin
    .from("company_domains")
    .select("*")
    .eq("team_id", me.team_id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ domains: domains || [] });
} 