import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since = new Date(); since.setDate(since.getDate()-6); since.setHours(0,0,0,0);

  const [{ data: sent }, { data: reps }] = await Promise.all([
    supabase.from("v_step_sent_daily").select("*").eq("campaign_id", params.id).gte("day", since.toISOString().slice(0,10)),
    supabase.from("v_step_replies_daily").select("*").eq("campaign_id", params.id).gte("day", since.toISOString().slice(0,10))
  ]);

  return NextResponse.json({ sent: sent ?? [], replies: reps ?? [] });
}
