import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("campaign_goals")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goal: data ?? null });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));

  const payload = {
    campaign_id: params.id,
    window_days: body.window_days ?? 30,
    target_sends: body.target_sends ?? null,
    target_reply_rate: body.target_reply_rate ?? null,
    target_open_rate: body.target_open_rate ?? null,
    target_bounce_rate: body.target_bounce_rate ?? null,
    notes: body.notes ?? null,
    active: body.active ?? true,
  };

  const { data, error } = await supabase.from("campaign_goals").insert(payload).select("*").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goal: data });
}


