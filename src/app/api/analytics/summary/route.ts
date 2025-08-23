import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error:"Not authed" }, { status:401 });

  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.json({ error:"No team" }, { status:400 });

  const teamId = prof.team_id;

  const { count: replies } = await supabaseAdmin.from("ai_reply_events")
    .select("id",{ count:"exact", head:true })
    .eq("team_id", teamId);

  const { count: meetings } = await supabaseAdmin.from("ai_reply_events")
    .select("id",{ count:"exact", head:true })
    .eq("team_id", teamId).eq("meeting_booked", true);

  // naive calc: assume 5m per reply saved
  const hoursSaved = ((replies||0) * 5) / 60;

  return NextResponse.json({
    replies: replies||0,
    meetings: meetings||0,
    hoursSaved: Math.round(hoursSaved*10)/10,
  });
}

