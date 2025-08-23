import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import { listSlackChannels } from "@/lib/slack";

export async function GET() {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json([], { status: 401 });
  
  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.json([]);
  
  const list = await listSlackChannels(prof.team_id);
  return NextResponse.json(list);
} 