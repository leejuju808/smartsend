import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error:"Not authed" }, { status:401 });
  
  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.json({ error:"No team" }, { status:400 });

  const { channel_id } = await req.json();
  await supabaseAdmin.from("slack_settings").upsert({ 
    team_id: prof.team_id, 
    channel_id, 
    updated_at: new Date().toISOString() 
  });
  
  return NextResponse.json({ ok:true });
} 