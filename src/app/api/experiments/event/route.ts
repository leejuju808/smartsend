import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });
  
  const { experiment_id, variant, event } = await req.json();
  if (!experiment_id || !variant || !event) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  
  await supabaseAdmin
    .from("experiment_events")
    .insert({ user_id: userId, experiment_id, variant, event });
  
  return NextResponse.json({ ok: true });
} 