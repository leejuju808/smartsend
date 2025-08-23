import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import { syncSeatsToStripe } from "@/lib/seatBilling";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
  const { member_id } = await req.json();

  // get caller's team
  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.json({ error: "No team" }, { status: 400 });

  // only owner/admin can remove
  const { data: me } = await supabaseAdmin
    .from("team_members").select("role").eq("team_id", prof.team_id).eq("user_id", userId).maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Don't allow removing the owner
  const { data: team } = await supabaseAdmin.from("teams").select("owner_id").eq("id", prof.team_id).maybeSingle();
  if (team?.owner_id === member_id) {
    return NextResponse.json({ error: "Cannot remove team owner" }, { status: 400 });
  }

  await supabaseAdmin.from("team_members").delete().eq("team_id", prof.team_id).eq("user_id", member_id);
  await supabaseAdmin.from("profiles").update({ team_id: null }).eq("id", member_id);

  await syncSeatsToStripe(prof.team_id);
  return NextResponse.json({ ok: true });
} 