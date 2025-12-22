import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("campaigns")
    .select("id,tz,send_start,send_end,days_of_week,daily_cap_override,min_delay_minutes")
    .eq("id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ schedule: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaignId = params.id;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: isOwner } = await supabase.rpc("is_campaign_owner", { p_campaign: campaignId });
  if (!isOwner) return NextResponse.json({ error: "Only owner can edit schedule." }, { status: 403 });

  const body = await req.json();
  const { tz, send_start, send_end, days_of_week, daily_cap_override, min_delay_minutes } = body;

  // Apply with guard
  const { error: upErr } = await supabase.rpc("normalize_campaign_schedule", {
    p_id: campaignId, p_tz: tz, p_start: send_start, p_end: send_end,
    p_days: days_of_week, p_cap: daily_cap_override, p_min_delay: min_delay_minutes
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  await supabase.rpc("log_audit", {
    p_actor: user.id,
    p_campaign: campaignId,
    p_entity_type: "campaign",
    p_entity: campaignId,
    p_action: "schedule_update",
    p_meta: body
  });

  return NextResponse.json({ ok: true });
}



